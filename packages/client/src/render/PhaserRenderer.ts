import Phaser from "phaser";
import { formatTime, gameTimeAt, type Command, type Sim } from "@qh/core";
import { FixedStepper } from "../loop.ts";
import { DEFAULT_KEYS, intentFromActions, sameIntent, type HeldActions, type MoveIntent } from "../input.ts";
import type { Renderer } from "./Renderer.ts";

/**
 * T0.4 renderer spike: proves Phaser can show a tilemap with normal-mapped walls, a cone light
 * (stand-in for a robot's vision), and a neon point light, driven by the fixed-step core.
 * Art is generated procedurally so the spike has no asset files. Not final art or final structure.
 */

const TILE = 32;
// '#' wall, '.' floor
const MAP = [
  "########################",
  "#......#.......#.......#",
  "#......#.......#.......#",
  "#..............#.......#",
  "#......#.......#.......#",
  "#......#########.......#",
  "#......................#",
  "#......................#",
  "#......#########.......#",
  "#......#.......#.......#",
  "#..............#.......#",
  "#......#.......#.......#",
  "#......#.......#.......#",
  "########################",
];
const COLS = MAP[0]!.length;
const ROWS = MAP.length;

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

class QuietScene extends Phaser.Scene {
  private readonly sim: Sim;
  private stepper!: FixedStepper;
  private held: HeldActions = { up: false, down: false, left: false, right: false, run: false, sneak: false };
  private lastIntent: MoveIntent = { dx: 0, dy: 0, mode: "walk" };
  private pending: Command[] = [];
  private player!: Phaser.GameObjects.Image;
  private cone!: Phaser.GameObjects.Light;
  private facing = 0;
  private hud!: Phaser.GameObjects.Text;
  private prev = { x: 3, y: 7 };

  constructor(sim: Sim) {
    super("quiet");
    this.sim = sim;
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

    MAP.forEach((row, y) => {
      for (let x = 0; x < COLS; x++) {
        this.add.image(x * TILE, y * TILE, row[x] === "#" ? "wall" : "floor").setOrigin(0).setLighting(true);
      }
    });

    this.player = this.add.image(0, 0, "player").setLighting(true).setDepth(10);

    this.lights.enable().setAmbientColor(0x1a1d30);
    const vision = this.sim.config.vision;
    const coneWidth = Phaser.Math.DegToRad(vision.coneDegrees);
    this.cone = this.lights.addConeLight(0, 0, vision.rangeTiles * TILE, 0xfff0c0, 2, 0, coneWidth * 0.7, coneWidth);
    // A neon sign on the central wall, for the colored-light look.
    this.lights.addLight(11.5 * TILE, 5.5 * TILE, 5 * TILE, 0xff2a9d, 1.4);
    this.lights.addLight(2 * TILE, 12 * TILE, 4 * TILE, 0x2affd5, 1);

    this.hud = this.add
      .text(8, 6, "", { fontFamily: "monospace", fontSize: "12px", color: "#c8ccdf" })
      .setDepth(100)
      .setScrollFactor(0);

    this.stepper = new FixedStepper(this.sim.config.sim.ticksPerSecond);
    this.sim.tick([{ type: "Teleport", x: 3, y: 7 }]);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      const apply = (code: string, down: boolean) => {
        for (const action of Object.keys(DEFAULT_KEYS) as (keyof HeldActions)[]) {
          if (DEFAULT_KEYS[action].includes(code)) this.held[action] = down;
        }
      };
      keyboard.on("keydown", (e: KeyboardEvent) => apply(e.code, true));
      keyboard.on("keyup", (e: KeyboardEvent) => apply(e.code, false));
    }
  }

  override update(_time: number, delta: number): void {
    const intent = intentFromActions(this.held);
    if (!sameIntent(intent, this.lastIntent)) {
      this.lastIntent = intent;
      this.pending.push({ type: "SetMove", ...intent });
      if (intent.dx !== 0 || intent.dy !== 0) this.facing = Math.atan2(intent.dy, intent.dx);
    }

    const ticks = this.stepper.advance(delta);
    for (let i = 0; i < ticks; i++) {
      this.prev = { x: this.sim.state.player.x, y: this.sim.state.player.y };
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

    const t = gameTimeAt(this.sim.state.tick, this.sim.config);
    this.hud.setText(
      `${formatTime(t)}${t.isCurfew ? "  CURFEW" : ""}${t.isQuietHours ? "  QUIET HOURS" : ""}\n` +
        `fps ${this.game.loop.actualFps.toFixed(0)}  WASD move, Shift run, Ctrl/C sneak`,
    );
  }
}

export class PhaserRenderer implements Renderer {
  private game?: Phaser.Game;

  start(host: HTMLElement, sim: Sim): void {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: COLS * TILE,
      height: ROWS * TILE,
      backgroundColor: "#07070c",
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: new QuietScene(sim),
    });
  }

  destroy(): void {
    this.game?.destroy(true);
  }
}
