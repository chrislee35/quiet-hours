import Phaser from "phaser";
import { PALETTES, canvasColours } from "../palette.ts";
import { hasTag, isSolid, zoneAt, type Command, type RobotMode, type Sim } from "@qh/core";
import { FixedStepper } from "../loop.ts";
import { intentFromActions, sameIntent, type MoveIntent } from "../input/actions.ts";
import type { RenderDeps, Renderer } from "./Renderer.ts";

/**
 * T0.4 renderer spike: proves Phaser can show a tilemap with normal-mapped walls, a cone light
 * (stand-in for a robot's vision), and a neon point light, driven by the fixed-step core.
 * Art is generated procedurally so the spike has no asset files. Not final art or final structure.
 */

const TILE = 32;
/** How much the camera magnifies the world. At 1.5 about 20 x 11 tiles are visible, enough to see a robot's 6-tile cone. */
const CAMERA_ZOOM = 1.5;
const VIEW_W = 960;
const VIEW_H = 540;

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  size: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  paintNormal: (ctx: CanvasRenderingContext2D) => void,
): void {
  const color = document.createElement("canvas");
  const normal = document.createElement("canvas");
  color.width = color.height = normal.width = normal.height = size;
  paint(color.getContext("2d")!);
  paintNormal(normal.getContext("2d")!);
  const texture = scene.textures.addCanvas(key, color);
  texture?.setDataSource(normal);
}

const FLAT = "rgb(128,128,255)";

/** Blend two 0xRRGGBB colours (t = 0 gives a, 1 gives b). */
const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** What a robot's view cone is tinted, by its mode, from the player's palette (the cone also grows more solid with suspicion). */
function modeColour(mode: RobotMode, pal: { warn: number; bad: number }): number {
  if (mode === "patrol") return pal.warn;
  if (mode === "investigate" || mode === "search") return mix(pal.warn, pal.bad, 0.5);
  return pal.bad;
}

/** Robot body tint by type, so the player can tell a Hound from a Warden at a glance (shape and label also differ). */
const KIND_TINT: Record<string, number> = {
  warden: 0xffffff,
  sentry: 0x9fd0ff,
  checker: 0xb8ffb0,
  hound: 0xffa070,
  auditor: 0xe0b0ff,
  heavy: 0xff7a7a,
};
const KIND_SCALE: Record<string, number> = { heavy: 1.35, hound: 0.85 };

/** The player's own light cone (a stand-in until the Signal Lens and real lighting art). */
const PLAYER_LIGHT_DEGREES = 90;
const PLAYER_LIGHT_TILES = 6;

class QuietScene extends Phaser.Scene {
  private readonly sim: Sim;
  private stepper!: FixedStepper;
  private lastIntent: MoveIntent = { dx: 0, dy: 0, mode: "walk" };
  private pending: Command[] = [];
  private player!: Phaser.GameObjects.Image;
  private cone!: Phaser.GameObjects.Light;
  private facing = 0;
  private prev = { x: 0, y: 0 };
  private doorSprites = new Map<string, Phaser.GameObjects.Image>();
  private zoneLayer!: Phaser.GameObjects.Graphics;
  private zonePalette = "";
  private robotSprites = new Map<string, Phaser.GameObjects.Image>();
  private prevRobots = new Map<string, { x: number; y: number }>();
  private cones!: Phaser.GameObjects.Graphics;
  private npcMarks = new Map<string, [Phaser.GameObjects.Image, Phaser.GameObjects.Text]>();
  private pickupMarks = new Map<string, Phaser.GameObjects.GameObject[]>();
  private promptText!: Phaser.GameObjects.Text;
  private readonly deps: RenderDeps;
  /** Whether a window was open when this frame began; presses handled mid-frame must not leak into the world. */
  private uiOpenAtFrameStart = false;

  constructor(sim: Sim, deps: RenderDeps) {
    super("quiet");
    this.sim = sim;
    this.deps = deps;
  }

  create(): void {
    canvasTexture(
      this,
      "floor",
      TILE,
      (c) => {
        c.fillStyle = "#2a2d3d";
        c.fillRect(0, 0, TILE, TILE);
        c.fillStyle = "#23263a";
        c.fillRect(0, 0, TILE, 1);
        c.fillRect(0, 0, 1, TILE);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );
    canvasTexture(
      this,
      "wall",
      TILE,
      (c) => {
        c.fillStyle = "#4a4f6a";
        c.fillRect(0, 0, TILE, TILE);
        c.fillStyle = "#3b4058";
        c.fillRect(6, 6, TILE - 12, TILE - 12);
      },
      (c) => {
        // Raised bevel: edge normals tilt outward so cone/point light rakes across the wall faces.
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
        c.fillStyle = "rgb(128,40,200)"; // top edge faces up
        c.fillRect(0, 0, TILE, 6);
        c.fillStyle = "rgb(128,215,200)"; // bottom edge faces down
        c.fillRect(0, TILE - 6, TILE, 6);
        c.fillStyle = "rgb(40,128,200)"; // left
        c.fillRect(0, 0, 6, TILE);
        c.fillStyle = "rgb(215,128,200)"; // right
        c.fillRect(TILE - 6, 0, 6, TILE);
      },
    );
    canvasTexture(
      this,
      "player",
      TILE,
      (c) => {
        c.fillStyle = "#e8d27a";
        c.beginPath();
        c.arc(TILE / 2, TILE / 2, 9, 0, Math.PI * 2);
        c.fill();
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );

    canvasTexture(
      this,
      "door_closed",
      TILE,
      (c) => {
        c.fillStyle = "#8a6a2a";
        c.fillRect(2, 2, TILE - 4, TILE - 4);
        c.fillStyle = "#5c4519";
        c.fillRect(TILE / 2 - 1, 2, 2, TILE - 4);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );
    canvasTexture(
      this,
      "door_open",
      TILE,
      (c) => {
        c.fillStyle = "#5c4519";
        c.fillRect(0, 0, 4, TILE);
        c.fillRect(TILE - 4, 0, 4, TILE);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );

    const world = this.sim.world;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const wall = world.wall[y * world.width + x] === 1;
        this.add.image(x * TILE, y * TILE, wall ? "wall" : "floor").setOrigin(0).setLighting(true);
      }
    }
    for (const door of world.doors) {
      const img = this.add.image(door.x * TILE, door.y * TILE, "door_closed").setOrigin(0).setLighting(true).setDepth(5);
      this.doorSprites.set(door.id, img);
    }

    canvasTexture(
      this,
      "robot",
      TILE,
      (c) => {
        c.fillStyle = "#c9ccd8";
        c.beginPath();
        c.moveTo(TILE / 2 + 11, TILE / 2); // nose points east (angle 0)
        c.lineTo(TILE / 2 - 8, TILE / 2 - 9);
        c.lineTo(TILE / 2 - 8, TILE / 2 + 9);
        c.closePath();
        c.fill();
        c.fillStyle = "#e23d4d";
        c.fillRect(TILE / 2 + 3, TILE / 2 - 1.5, 4, 3);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );
    canvasTexture(
      this,
      "npc",
      TILE,
      (c) => {
        c.fillStyle = "#6fb7ff";
        c.beginPath();
        c.arc(TILE / 2, TILE / 2, 10, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#10121c";
        c.fillRect(TILE / 2 - 5, TILE / 2 - 3, 3, 3);
        c.fillRect(TILE / 2 + 2, TILE / 2 - 3, 3, 3);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );
    canvasTexture(
      this,
      "terminal",
      TILE,
      (c) => {
        c.fillStyle = "#1f3a44";
        c.fillRect(6, 7, TILE - 12, TILE - 12);
        c.fillStyle = "#5ff0ff";
        c.fillRect(9, 10, TILE - 18, 8);
        c.fillStyle = "#2b5662";
        c.fillRect(9, 21, TILE - 18, 3);
      },
      (c) => {
        c.fillStyle = FLAT;
        c.fillRect(0, 0, TILE, TILE);
      },
    );
    for (const t of this.sim.world.terminals) {
      this.add.image(t.x * TILE, t.y * TILE, "terminal").setOrigin(0).setLighting(true).setDepth(6);
      this.add
        .text((t.x + 0.5) * TILE, t.y * TILE - 2, "terminal", { fontFamily: "monospace", fontSize: "10px", color: "#7be3ff" })
        .setOrigin(0.5, 1)
        .setDepth(60);
    }
    for (const n of this.sim.world.npcs) {
      const sprite = this.add.image((n.x + 0.5) * TILE, (n.y + 0.5) * TILE, "npc").setLighting(true).setDepth(8);
      const label = this.add
        .text((n.x + 0.5) * TILE, n.y * TILE - 4, n.id.replace(/_/g, " "), { fontFamily: "monospace", fontSize: "10px", color: "#9fd0ff" })
        .setOrigin(0.5, 1)
        .setDepth(60);
      this.npcMarks.set(n.id, [sprite, label]);
    }
    for (const r of this.sim.state.robots) {
      this.robotSprites.set(
        r.id,
        this.add.image(0, 0, "robot").setLighting(true).setDepth(9).setTint(KIND_TINT[r.kind] ?? 0xffffff).setScale(KIND_SCALE[r.kind] ?? 1),
      );
      this.prevRobots.set(r.id, { x: r.x, y: r.y });
    }
    this.cones = this.add.graphics().setDepth(40);
    for (const pk of this.sim.world.pickups) {
      const cx = (pk.x + 0.5) * TILE;
      const cy = (pk.y + 0.5) * TILE;
      const gem = this.add.graphics().setDepth(7);
      gem.fillStyle(0x7be3ff, 0.9).fillTriangle(cx, cy - 9, cx + 8, cy, cx, cy + 9).fillTriangle(cx, cy - 9, cx - 8, cy, cx, cy + 9);
      gem.lineStyle(2, 0xffffff, 0.8).strokeCircle(cx, cy, 13);
      const name = this.sim.content.augments[pk.grant.split(":")[1] ?? ""]?.name ?? (pk.grant.split(":")[1] ?? pk.grant).replace(/_/g, " ");
      const label = this.add.text(cx, cy - 16, name, { fontFamily: "monospace", fontSize: "10px", color: "#7be3ff" }).setOrigin(0.5, 1).setDepth(60);
      this.pickupMarks.set(pk.id, [gem, label]);
    }
    // In-world interaction prompt (CORE-5): appears above whatever Interact would act on.
    this.promptText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "11px", color: "#10121c", backgroundColor: "#ffd36b", padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(70)
      .setVisible(false);

    // Zone overlay (press Z to toggle): teal = public, amber/red = restricted by required permission.
    this.zoneLayer = this.add.graphics().setDepth(50);
    this.drawZones();

    this.player = this.add.image(0, 0, "player").setLighting(true).setDepth(10);

    this.lights.enable().setAmbientColor(0x1a1d30);
    const coneWidth = Phaser.Math.DegToRad(PLAYER_LIGHT_DEGREES);
    this.cone = this.lights.addConeLight(0, 0, PLAYER_LIGHT_TILES * TILE, 0xfff0c0, 2, 0, coneWidth * 0.7, coneWidth);
    // A neon sign on the central wall, for the colored-light look.
    this.lights.addLight(11.5 * TILE, 5.5 * TILE, 5 * TILE, 0xff2a9d, 1.4);
    this.lights.addLight(2 * TILE, 12 * TILE, 4 * TILE, 0x2affd5, 1);
    this.lights.addLight(20 * TILE, 7 * TILE, 5 * TILE, 0xffaa22, 1.1);

    this.sim.bus.subscribe((e) => {
      if (e.type !== "GameLoaded") return;
      // A loaded or new game jumps everything: do not interpolate from the old positions.
      const p = this.sim.state.player;
      this.prev = { x: p.x, y: p.y };
      for (const r of this.sim.state.robots) this.prevRobots.set(r.id, { x: r.x, y: r.y });
    });
    this.stepper = new FixedStepper(this.sim.config.sim.ticksPerSecond);
    this.prev = { x: this.sim.state.player.x, y: this.sim.state.player.y };

    // Camera follows the player so maps larger than the screen work; smaller maps are centred.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.width * TILE, world.height * TILE);
    cam.setZoom(CAMERA_ZOOM);
    cam.startFollow(this.player, true, 0.12, 0.12);

    this.deps.controller.onPress((action) => {
      if (this.uiOpenAtFrameStart || this.sim.state.conversation || this.sim.state.terminal || this.deps.isPaused()) return;
      if (action === "interact") this.pending.push({ type: "Interact" });
      else if (action === "zones") this.zoneLayer.setVisible(!this.zoneLayer.visible);
      else if (action === "tool") {
        const id = this.deps.toolbelt.ready;
        if (id) this.pending.push({ type: "UseItem", id, dx: Math.cos(this.facing), dy: Math.sin(this.facing) });
      } else if (action === "pulse") {
        const id = this.sim.state.augments.equipped.find((a) => this.sim.content.augments[a]?.jam);
        if (id) this.pending.push({ type: "UseAugment", id });
      }
    });
  }

  /** The restricted-zone overlay (press Z), tinted from the player's palette; redrawn when the palette changes. */
  private drawZones(): void {
    const { world } = this.sim;
    const pal = canvasColours(PALETTES[this.deps.settings().palette]);
    this.zonePalette = this.deps.settings().palette;
    this.zoneLayer.clear();
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const z = zoneAt(world, x, y);
        if (z && z.requiredPermission > 0) {
          this.zoneLayer.fillStyle(z.requiredPermission >= 3 ? pal.bad : pal.warn, 0.13);
          this.zoneLayer.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
  }

  /** Robot sprites, occluded vision cones, and suspicion bars. */
  private drawRobots(alpha: number): void {
    const { state, config, world } = this.sim;
    const rays = 28;
    const pal = canvasColours(PALETTES[this.deps.settings().palette]);
    const lens = hasTag(state, this.sim.content, "reveal_cones");
    this.cones.clear();
    for (const r of state.robots) {
      const prev = this.prevRobots.get(r.id) ?? r;
      const x = (prev.x + (r.x - prev.x) * alpha) * TILE;
      const y = (prev.y + (r.y - prev.y) * alpha) * TILE;
      this.robotSprites.get(r.id)?.setPosition(x, y).setRotation(r.facing).setVisible(!r.destroyed && !r.dormant);
      if (r.destroyed || r.dormant) continue;
      const prof = config.robots[r.kind];
      const half = (prof.coneDegrees * Math.PI) / 360;
      const jammed = state.tick < r.jammedUntil;
      this.robotSprites.get(r.id)?.setAlpha(jammed ? 0.35 : 1);
      if (jammed || !this.showsCone(r.x, r.y, lens, 7)) continue;

      // Cone polygon: march each ray until it meets a wall or closed door, so the shape is what the robot truly sees.
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x, y)];
      for (let i = 0; i <= rays; i++) {
        const ang = r.facing - half + (2 * half * i) / rays;
        let d = 0;
        while (d < prof.rangeTiles) {
          const nd = d + 0.2;
          if (isSolid(world, state.doors, Math.floor(r.x + Math.cos(ang) * nd), Math.floor(r.y + Math.sin(ang) * nd))) break;
          d = nd;
        }
        pts.push(new Phaser.Math.Vector2(x + Math.cos(ang) * d * TILE, y + Math.sin(ang) * d * TILE));
      }
      this.cones.fillStyle(modeColour(r.mode, pal), 0.16 + 0.2 * r.suspicion);
      this.cones.fillPoints(pts, true);

      // Suspicion bar above the robot: fills as it becomes certain of the player.
      if (r.suspicion > 0.01) {
        this.cones.fillStyle(0x000000, 0.6);
        this.cones.fillRect(x - 12, y - 22, 24, 4);
        this.cones.fillStyle(r.suspicion >= 1 ? pal.bad : pal.warn, 1);
        this.cones.fillRect(x - 12, y - 22, 24 * r.suspicion, 4);
      }
    }
    this.drawCameras(lens);
  }

  /** Is there a clear line between the player and this point? */
  private clearLine(x: number, y: number): boolean {
    const { state, world } = this.sim;
    const p = state.player;
    const d = Math.hypot(x - p.x, y - p.y);
    for (let t = 0.2; t < d; t += 0.2) {
      if (isSolid(world, state.doors, Math.floor(p.x + ((x - p.x) * t) / d), Math.floor(p.y + ((y - p.y) * t) / d))) return false;
    }
    return true;
  }

  /**
   * Whether to draw a view cone. You can read cones that are close or that you can see; the Signal Lens
   * shows every cone, through walls and from any distance.
   */
  private showsCone(x: number, y: number, lens: boolean, near: number): boolean {
    if (lens) return true;
    const p = this.sim.state.player;
    return Math.hypot(x - p.x, y - p.y) <= near || this.clearLine(x, y);
  }

  /** Fixed cameras: a small housing always, and the view cone when it is near, in sight, or the Signal Lens is worn. */
  private drawCameras(lens: boolean): void {
    const { state, config, world } = this.sim;
    const pal = canvasColours(PALETTES[this.deps.settings().palette]);
    const cfg = config.cameras;
    const half = (cfg.coneDegrees * Math.PI) / 360;
    for (const c of state.cameras) {
      const x = c.x * TILE;
      const y = c.y * TILE;
      const off = c.broken || c.dormant || state.tick < c.jammedUntil;
      this.cones.fillStyle(off ? 0x555555 : pal.bad, 1).fillRect(x - 5, y - 5, 10, 10);
      this.cones.lineStyle(2, 0x10121c, 1).strokeRect(x - 5, y - 5, 10, 10);
      if (off || !this.showsCone(c.x, c.y, lens, 5)) continue;
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x, y)];
      for (let i = 0; i <= 24; i++) {
        const ang = c.heading - half + (2 * half * i) / 24;
        let d = 0.6; // starts clear of its own wall tile
        while (d < cfg.rangeTiles) {
          const nd = d + 0.2;
          if (isSolid(world, state.doors, Math.floor(c.x + Math.cos(ang) * nd), Math.floor(c.y + Math.sin(ang) * nd))) break;
          d = nd;
        }
        pts.push(new Phaser.Math.Vector2(x + Math.cos(ang) * d * TILE, y + Math.sin(ang) * d * TILE));
      }
      this.cones.fillStyle(pal.bad, 0.12 + 0.25 * c.suspicion);
      this.cones.fillPoints(pts, true);
    }
  }

  override update(_time: number, delta: number): void {
    this.uiOpenAtFrameStart = this.sim.state.conversation !== null || this.sim.state.terminal !== null || this.deps.isPaused();
    this.deps.controller.poll();
    const intent = intentFromActions(this.deps.controller.held);
    if (!sameIntent(intent, this.lastIntent)) {
      this.lastIntent = intent;
      this.pending.push({ type: "SetMove", ...intent });
      if (intent.dx !== 0 || intent.dy !== 0) this.facing = Math.atan2(intent.dy, intent.dx);
    }

    // While a conversation is open the world is frozen (CORE-4): do not advance or queue world commands.
    const talking = this.sim.state.conversation !== null || this.sim.state.terminal !== null || this.deps.isPaused();
    if (talking) this.pending = [];
    const ticks = this.stepper.advance(talking ? 0 : delta);
    for (let i = 0; i < ticks; i++) {
      this.prev = { x: this.sim.state.player.x, y: this.sim.state.player.y };
      for (const r of this.sim.state.robots) this.prevRobots.set(r.id, { x: r.x, y: r.y });
      this.sim.tick(this.pending);
      this.pending = [];
    }

    // Interpolate between the previous and current tick for smooth motion.
    const p = this.sim.state.player;
    const a = this.stepper.alpha;
    const x = (this.prev.x + (p.x - this.prev.x) * a) * TILE;
    const y = (this.prev.y + (p.y - this.prev.y) * a) * TILE;
    this.player.setPosition(x, y);
    this.cone.setPosition(x, y).setConeRotation(this.facing);

    if (this.deps.settings().palette !== this.zonePalette) this.drawZones();
    const smooth = this.deps.settings().reduceMotion ? 1 : 0.12;
    this.cameras.main.setLerp(smooth, smooth);
    this.drawRobots(a);
    for (const [id, [sprite, label]] of this.npcMarks) {
      const n = this.sim.state.npcs[id];
      if (!n) continue;
      sprite.setPosition(n.x * TILE, n.y * TILE).setVisible(!n.away);
      label.setPosition(n.x * TILE, (n.y - 0.5) * TILE - 4).setVisible(!n.away);
    }
    for (const [id, marks] of this.pickupMarks) for (const m of marks) (m as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(!this.sim.state.flags[`picked_${id}`]);

    const prompt = this.sim.prompt();
    if (prompt) {
      const src = this.deps.controller.lastSource;
      const key = src === "touch" ? "Use" : src === "pad" ? "A" : "E";
      this.promptText.setFontSize(Math.round((11 * this.deps.settings().textScale) / 100)).setText(`${key}: ${prompt.label}`).setPosition((prompt.x + 0.5) * TILE, prompt.y * TILE - 6).setVisible(true);
    } else {
      this.promptText.setVisible(false);
    }

    for (const [id, sprite] of this.doorSprites) {
      sprite.setTexture(this.sim.state.doors[id]?.open ? "door_open" : "door_closed");
    }

    this.deps.hud.update(this.game.loop.actualFps, this.deps.controller.padConnected);
  }
}

export class PhaserRenderer implements Renderer {
  private game?: Phaser.Game;

  start(host: HTMLElement, sim: Sim, deps: RenderDeps): void {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: "#07070c",
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: new QuietScene(sim, deps),
    });
  }

  destroy(): void {
    this.game?.destroy(true);
  }
}
