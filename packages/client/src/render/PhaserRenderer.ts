import Phaser from "phaser";
import { isSolid, zoneAt, type Command, type RobotMode, type Sim } from "@qh/core";
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

const MODE_COLOR: Record<RobotMode, number> = {
  patrol: 0xffd36b,
  investigate: 0xff9a3c,
  search: 0xff9a3c,
  chase: 0xff3355,
};

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
  private robotSprites = new Map<string, Phaser.GameObjects.Image>();
  private prevRobots = new Map<string, { x: number; y: number }>();
  private cones!: Phaser.GameObjects.Graphics;
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
      this.add.image((n.x + 0.5) * TILE, (n.y + 0.5) * TILE, "npc").setLighting(true).setDepth(8);
      this.add
        .text((n.x + 0.5) * TILE, n.y * TILE - 4, n.id.replace(/_/g, " "), { fontFamily: "monospace", fontSize: "10px", color: "#9fd0ff" })
        .setOrigin(0.5, 1)
        .setDepth(60);
    }
    for (const r of this.sim.state.robots) {
      this.robotSprites.set(r.id, this.add.image(0, 0, "robot").setLighting(true).setDepth(9));
      this.prevRobots.set(r.id, { x: r.x, y: r.y });
    }
    this.cones = this.add.graphics().setDepth(40);

    // Zone overlay (press Z to toggle): teal = public, amber/red = restricted by required permission.
    this.zoneLayer = this.add.graphics().setDepth(50);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const z = zoneAt(world, x, y);
        if (z && z.requiredPermission > 0) {
          this.zoneLayer.fillStyle(z.requiredPermission >= 3 ? 0xff3355 : 0xffaa22, 0.13);
          this.zoneLayer.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }

    this.player = this.add.image(0, 0, "player").setLighting(true).setDepth(10);

    this.lights.enable().setAmbientColor(0x1a1d30);
    const vision = this.sim.config.vision;
    const coneWidth = Phaser.Math.DegToRad(vision.coneDegrees);
    this.cone = this.lights.addConeLight(0, 0, vision.rangeTiles * TILE, 0xfff0c0, 2, 0, coneWidth * 0.7, coneWidth);
    // A neon sign on the central wall, for the colored-light look.
    this.lights.addLight(11.5 * TILE, 5.5 * TILE, 5 * TILE, 0xff2a9d, 1.4);
    this.lights.addLight(2 * TILE, 12 * TILE, 4 * TILE, 0x2affd5, 1);
    this.lights.addLight(20 * TILE, 7 * TILE, 5 * TILE, 0xffaa22, 1.1);

    this.stepper = new FixedStepper(this.sim.config.sim.ticksPerSecond);
    this.prev = { x: this.sim.state.player.x, y: this.sim.state.player.y };

    // Camera follows the player so maps larger than the screen work; smaller maps are centred.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.width * TILE, world.height * TILE);
    cam.setZoom(CAMERA_ZOOM);
    cam.startFollow(this.player, true, 0.12, 0.12);

    this.deps.controller.onPress((action) => {
      if (this.uiOpenAtFrameStart || this.sim.state.conversation || this.sim.state.terminal) return;
      if (action === "interact") this.pending.push({ type: "Interact" });
      else if (action === "zones") this.zoneLayer.setVisible(!this.zoneLayer.visible);
    });
  }

  /** Robot sprites, occluded vision cones, and suspicion bars. */
  private drawRobots(alpha: number): void {
    const { state, config, world } = this.sim;
    const vis = config.vision;
    const half = (vis.coneDegrees * Math.PI) / 360;
    const rays = 28;
    this.cones.clear();
    for (const r of state.robots) {
      const prev = this.prevRobots.get(r.id) ?? r;
      const x = (prev.x + (r.x - prev.x) * alpha) * TILE;
      const y = (prev.y + (r.y - prev.y) * alpha) * TILE;
      this.robotSprites.get(r.id)?.setPosition(x, y).setRotation(r.facing);

      // Cone polygon: march each ray until it meets a wall or closed door, so the shape is what the robot truly sees.
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x, y)];
      for (let i = 0; i <= rays; i++) {
        const ang = r.facing - half + (2 * half * i) / rays;
        let d = 0;
        while (d < vis.rangeTiles) {
          const nd = d + 0.2;
          if (isSolid(world, state.doors, Math.floor(r.x + Math.cos(ang) * nd), Math.floor(r.y + Math.sin(ang) * nd))) break;
          d = nd;
        }
        pts.push(new Phaser.Math.Vector2(x + Math.cos(ang) * d * TILE, y + Math.sin(ang) * d * TILE));
      }
      this.cones.fillStyle(MODE_COLOR[r.mode], 0.16 + 0.2 * r.suspicion);
      this.cones.fillPoints(pts, true);

      // Suspicion bar above the robot: fills as it becomes certain of the player.
      if (r.suspicion > 0.01) {
        this.cones.fillStyle(0x000000, 0.6);
        this.cones.fillRect(x - 12, y - 22, 24, 4);
        this.cones.fillStyle(r.suspicion >= 1 ? 0xff3355 : 0xffd36b, 1);
        this.cones.fillRect(x - 12, y - 22, 24 * r.suspicion, 4);
      }
    }
  }

  override update(_time: number, delta: number): void {
    this.uiOpenAtFrameStart = this.sim.state.conversation !== null || this.sim.state.terminal !== null;
    this.deps.controller.poll();
    const intent = intentFromActions(this.deps.controller.held);
    if (!sameIntent(intent, this.lastIntent)) {
      this.lastIntent = intent;
      this.pending.push({ type: "SetMove", ...intent });
      if (intent.dx !== 0 || intent.dy !== 0) this.facing = Math.atan2(intent.dy, intent.dx);
    }

    // While a conversation is open the world is frozen (CORE-4): do not advance or queue world commands.
    const talking = this.sim.state.conversation !== null || this.sim.state.terminal !== null;
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

    this.drawRobots(a);

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
