/**
 * Who everybody is, to look at. Every named person gets their own little figure, drawn from a handful of shapes
 * (a person, a robot, a machine) and a tray of accessories, so the four mentors, Pallas, Brindle and the Gate's voice
 * can be told apart across a room. Pure canvas drawing: no art files. The table is data; add a line to add a face.
 *
 * Drawn on a 64x64 canvas, shown at about a tile and a bit.
 */

export type Extra =
  | "glasses" | "headphones" | "conductor_cap" | "hardhat" | "helmet" | "antenna" | "cracked_visor" | "chest_lamp" | "badge"
  | "scarf" | "satchel" | "pigeon" | "tie" | "apron" | "wheels" | "notes" | "eye" | "megaphone" | "train_face" | "papers"
  | "wrench" | "bun" | "bushy" | "flat_cap" | "hood" | "cardigan" | "lab_coat" | "shawl" | "slick" | "number" | "window"
  | "mug" | "pads" | "cone" | "sprout" | "bow" | "stubble" | "visor_scan" | "braid";

export interface Look {
  form: "human" | "robot" | "machine";
  body: string;
  accent: string;
  skin?: string;
  hair?: string;
  extras: Extra[];
  /** The ring under their feet: gold for the four mentors, teal for those who might come with you, red for officials, cyan for machines. */
  ring: string;
}

const GOLD = "#ffd36b";
const TEAL = "#2affd5";
const RED = "#ff6b7a";
const CYAN = "#7be3ff";
const NONE = "#5a6080";

const L = (form: Look["form"], body: string, accent: string, extras: Extra[], more: Partial<Look> = {}): Look => ({ form, body, accent, extras, ring: NONE, ...more });

export const NPC_LOOKS: Record<string, Look> = {
  // the four mentors
  ines: L("human", "#7a5a8e", "#f0e2b0", ["bun", "glasses", "papers"], { skin: "#e3b98f", hair: "#3b2a24", ring: GOLD }),
  maren: L("human", "#2c5a8c", "#ffd36b", ["conductor_cap", "badge"], { skin: "#8d5a3b", hair: "#161616", ring: GOLD }),
  tobias: L("human", "#4b5543", "#a9b596", ["helmet", "pads", "stubble"], { skin: "#c99a74", hair: "#9a9a9a", ring: GOLD }),
  silas: L("human", "#b8743a", "#f4dca4", ["bushy", "cardigan", "mug"], { skin: "#e8bf9b", hair: "#dcdcdc", ring: GOLD }),
  // the cell and its neighbours
  wren: L("human", "#3b6c5b", "#ffb36b", ["scarf"], { skin: "#d9a98a", hair: "#2a1a14" }),
  pallas: L("robot", "#8c9eac", TEAL, ["cracked_visor", "wrench", "antenna"], { ring: TEAL }),
  odd_sam: L("human", "#5b3a6e", GOLD, ["flat_cap", "tie"], { skin: "#c8a07a", hair: "#2a2a2a" }),
  doc_perrin: L("human", "#e6edf2", "#6fb7ff", ["lab_coat", "glasses", "bushy", "pigeon"], { skin: "#e2b790", hair: "#8d8d8d" }),
  teeter: L("human", "#8a3d3d", GOLD, ["headphones"], { skin: "#d4a47e", hair: "#3a2218" }),
  mrs_adeyemi_roth: L("human", "#7a5a8a", "#e8d8f0", ["shawl", "bun", "glasses"], { skin: "#8a5a3e", hair: "#d8d8d8" }),
  // the Core and the Belt
  dov_anselm: L("human", "#6e7078", "#d0d4dc", ["tie", "glasses", "papers"], { skin: "#dcb18c", hair: "#555", ring: RED }),
  pell: L("human", "#1f2638", "#c9d4e8", ["slick", "badge", "tie"], { skin: "#dbb28e", hair: "#15151a", ring: RED }),
  gus_varga: L("human", "#7a6a2f", "#e8c860", ["hardhat", "apron", "mug"], { skin: "#c99874", hair: "#777" }),
  brindle: L("robot", "#c4a263", "#ffd36b", ["wheels", "notes"], { ring: TEAL }),
  window_1: L("machine", "#566070", CYAN, ["window"], { ring: CYAN }),
  window_4: L("machine", "#566070", CYAN, ["window"], { ring: CYAN }),
  ticket: L("robot", "#d8d0b0", "#ff6b7a", ["number", "antenna"], { ring: CYAN }),
  checker_k: L("robot", "#7d8794", "#6bff9a", ["cone", "chest_lamp"], { ring: RED }),
  // under the city
  quill: L("human", "#2b394a", TEAL, ["hood", "satchel"], { skin: "#d1a07c", hair: "#222" }),
  conductor: L("machine", "#6a2f2f", GOLD, ["train_face"], { ring: CYAN }),
  gate_voice: L("machine", "#20243a", "#ff5a5a", ["eye"], { ring: RED }),
  civic_voice: L("machine", "#d8dce8", "#7be3ff", ["megaphone"], { ring: CYAN }),
  halloran_7: L("robot", "#2b2f3d", "#ff6b7a", ["badge", "visor_scan", "tie"], { ring: RED }),
  // beyond
  marrow: L("human", "#5a6b3c", "#e8d8a0", ["shawl", "braid"], { skin: "#7e5236", hair: "#8a3a24", ring: TEAL }),
  juniper: L("human", "#e0a040", "#fff0c0", ["bow", "sprout"], { skin: "#a8744f", hair: "#2a1a14", ring: TEAL }),
  bede: L("human", "#5f8a3c", "#d8f0a0", ["flat_cap", "sprout"], { skin: "#d1a07c", hair: "#5a3a22" }),
  odile: L("human", "#a98ac0", "#f0e0ff", ["shawl", "bun"], { skin: "#e6c3a4", hair: "#e0e0e0", ring: TEAL }),
  lila_voss: L("human", "#c8707a", "#ffe0e0", ["bow"], { skin: "#e8c4a8", hair: "#4a2a2a" }),
  host: L("robot", "#e8e0c8", "#ffb36b", ["tie", "antenna"], { ring: CYAN }),
  mari_quade: L("human", "#c8503c", "#ffe0a0", ["apron", "flat_cap"], { skin: "#d6a67f", hair: "#222" }),
};

const HAIRS = ["#2a1a14", "#5a3a22", "#8a8a8a", "#1a1a1a", "#7a4a22"];
const SKINS = ["#e3b98f", "#c99a74", "#8d5a3b", "#d6a67f", "#a8744f"];
const BODIES = ["#4a6a8a", "#6a4a7a", "#4a7a5a", "#8a5a3a", "#5a5a7a"];

/** The look for anyone not in the table: stable colours from their id, so a stranger is always the same stranger. */
export function lookFor(id: string): Look {
  const known = NPC_LOOKS[id];
  if (known) return known;
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T>(a: T[], k: number): T => a[(h >>> k) % a.length]!;
  return L("human", pick(BODIES, 1), "#e8e8f0", [pick<Extra>(["glasses", "flat_cap", "scarf", "bun", "bushy"], 4)], { skin: pick(SKINS, 7), hair: pick(HAIRS, 11) });
}

// ---- drawing ------------------------------------------------------------------------------------------------

type C = CanvasRenderingContext2D;
const S = 64;

function rr(c: C, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.lineWidth = 2; c.strokeStyle = stroke; c.stroke(); }
}
function circle(c: C, x: number, y: number, r: number, fill: string, stroke?: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.lineWidth = 2; c.strokeStyle = stroke; c.stroke(); }
}
const OUT = "#0c0e18";

export function drawLook(c: C, look: Look): void {
  c.clearRect(0, 0, S, S);
  c.lineJoin = "round";
  c.lineCap = "round";
  const has = (e: Extra) => look.extras.includes(e);
  if (look.form === "human") drawHuman(c, look, has);
  else if (look.form === "robot") drawRobot(c, look, has);
  else drawMachine(c, look, has);
  drawExtras(c, look, has);
}

function drawHuman(c: C, look: Look, has: (e: Extra) => boolean): void {
  const skin = look.skin ?? "#e3b98f";
  // shoulders and torso
  rr(c, 12, 36, 40, 24, 12, look.body, OUT);
  if (has("lab_coat")) { rr(c, 12, 36, 40, 24, 12, "#f2f6f8", OUT); c.fillStyle = look.body; c.fillRect(28, 38, 8, 20); }
  if (has("apron")) { rr(c, 20, 42, 24, 18, 6, look.accent, OUT); }
  if (has("cardigan")) { c.fillStyle = look.accent; c.fillRect(30, 38, 4, 20); for (const y of [42, 48, 54]) circle(c, 32, y, 1.6, "#5a3a1e"); }
  // neck and head
  rr(c, 28, 33, 8, 6, 2, skin);
  circle(c, 32, 24, 13, skin, OUT);
  // hair behind / on top
  const hair = look.hair ?? "#2a1a14";
  if (!has("flat_cap") && !has("conductor_cap") && !has("hardhat") && !has("helmet") && !has("hood") && !has("headphones")) {
    c.beginPath(); c.arc(32, 22, 13.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fillStyle = hair; c.fill();
  }
  if (has("slick")) { c.beginPath(); c.arc(32, 21, 13.5, Math.PI, Math.PI * 2); c.lineTo(45, 24); c.quadraticCurveTo(32, 15, 19, 24); c.fillStyle = hair; c.fill(); }
  // face
  circle(c, 27.5, 25, 1.9, OUT); circle(c, 36.5, 25, 1.9, OUT);
  c.strokeStyle = OUT; c.lineWidth = 1.6; c.beginPath(); c.moveTo(29, 31); c.quadraticCurveTo(32, 33, 35, 31); c.stroke();
}

function drawRobot(c: C, look: Look, _has: (e: Extra) => boolean): void {
  // treads / base
  rr(c, 10, 52, 18, 9, 4, "#2a2f3c", OUT); rr(c, 36, 52, 18, 9, 4, "#2a2f3c", OUT);
  // body
  rr(c, 14, 33, 36, 22, 7, look.body, OUT);
  rr(c, 22, 39, 20, 9, 3, "#14172a");
  c.fillStyle = look.accent; c.fillRect(25, 42, 14, 3);
  // head
  rr(c, 16, 9, 32, 25, 8, look.body, OUT);
  rr(c, 20, 15, 24, 12, 5, "#0b1220");
  circle(c, 27, 21, 3, look.accent); circle(c, 37, 21, 3, look.accent);
  // arms
  rr(c, 6, 36, 8, 16, 4, look.body, OUT); rr(c, 50, 36, 8, 16, 4, look.body, OUT);
}

function drawMachine(c: C, look: Look, has: (e: Extra) => boolean): void {
  rr(c, 10, 6, 44, 52, 10, look.body, OUT);
  rr(c, 15, 12, 34, 28, 7, "#0b1220");
  rr(c, 18, 44, 28, 8, 3, "#14172a");
  c.fillStyle = look.accent; c.fillRect(22, 47, 20, 2);
  if (!has("eye") && !has("train_face") && !has("window") && !has("megaphone")) circle(c, 32, 26, 6, look.accent);
}

function drawExtras(c: C, look: Look, has: (e: Extra) => boolean): void {
  const skin = look.skin ?? "#e3b98f";
  if (has("glasses")) {
    c.strokeStyle = "#1a1a28"; c.lineWidth = 2;
    c.strokeRect(22, 21, 8, 6); c.strokeRect(34, 21, 8, 6);
    c.beginPath(); c.moveTo(30, 24); c.lineTo(34, 24); c.stroke();
    c.fillStyle = "rgba(160,220,255,0.35)"; c.fillRect(22, 21, 8, 6); c.fillRect(34, 21, 8, 6);
  }
  if (has("headphones")) {
    c.strokeStyle = "#202330"; c.lineWidth = 4; c.beginPath(); c.arc(32, 22, 14, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    rr(c, 14, 20, 6, 11, 3, look.accent, OUT); rr(c, 44, 20, 6, 11, 3, look.accent, OUT);
  }
  if (has("conductor_cap")) {
    c.beginPath(); c.arc(32, 18, 14, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = look.body; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    rr(c, 17, 17, 30, 5, 2, "#1a1f2e", OUT); rr(c, 28, 10, 8, 6, 2, look.accent, OUT);
  }
  if (has("hardhat")) {
    c.beginPath(); c.arc(32, 19, 14.5, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = "#f2c230"; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    rr(c, 15, 18, 34, 5, 2, "#d9a81e", OUT); rr(c, 29, 8, 6, 8, 2, "#d9a81e", OUT);
  }
  if (has("helmet")) {
    c.beginPath(); c.arc(32, 20, 15, Math.PI * 0.95, Math.PI * 2.05); c.closePath(); c.fillStyle = "#59634e"; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    rr(c, 20, 19, 24, 7, 3, "rgba(20,28,40,0.75)", OUT);
    c.fillStyle = look.accent; c.fillRect(29, 9, 6, 4);
  }
  if (has("flat_cap")) {
    c.beginPath(); c.ellipse(32, 15, 15, 7, 0, Math.PI, Math.PI * 2); c.fillStyle = look.body; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    rr(c, 30, 13, 20, 5, 2, look.body, OUT);
  }
  if (has("hood")) {
    c.beginPath(); c.arc(32, 24, 17, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(46, 38); c.lineTo(18, 38); c.closePath(); c.fillStyle = look.body; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    circle(c, 32, 26, 10, skin, OUT); circle(c, 28.5, 27, 1.7, OUT); circle(c, 35.5, 27, 1.7, OUT);
    c.fillStyle = look.accent; c.fillRect(24, 22, 16, 2);
  }
  if (has("bun")) { circle(c, 32, 8, 6, look.hair ?? "#3b2a24", OUT); }
  if (has("bushy")) {
    for (const [x, y, r] of [[18, 22, 7], [46, 22, 7], [24, 12, 8], [40, 12, 8], [32, 9, 8]] as const) circle(c, x, y, r, look.hair ?? "#ddd", OUT);
    circle(c, 32, 24, 11.5, look.skin ?? "#e8bf9b"); circle(c, 28, 25, 1.8, OUT); circle(c, 36, 25, 1.8, OUT);
  }
  if (has("stubble")) { c.fillStyle = "rgba(60,50,45,0.45)"; c.beginPath(); c.arc(32, 28, 8, 0.1, Math.PI - 0.1); c.fill(); }
  if (has("scarf")) { rr(c, 20, 34, 24, 7, 3, look.accent, OUT); rr(c, 38, 38, 6, 14, 3, look.accent, OUT); }
  if (has("shawl")) { c.beginPath(); c.moveTo(12, 40); c.quadraticCurveTo(32, 54, 52, 40); c.lineTo(46, 56); c.lineTo(18, 56); c.closePath(); c.fillStyle = look.accent; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); }
  if (has("braid")) {
    // long side braid over the shoulder, tied off with the accent colour
    for (const [x, y, r] of [[22, 36, 4.2], [21, 41, 4], [22, 46, 3.7], [23, 51, 3.2]] as const) circle(c, x, y, r, look.hair ?? "#8a3a24", OUT);
    rr(c, 20, 53, 6, 3, 1.5, look.accent, OUT);
  }
  if (has("tie")) { c.beginPath(); c.moveTo(32, 38); c.lineTo(36, 42); c.lineTo(34, 54); c.lineTo(32, 56); c.lineTo(30, 54); c.lineTo(28, 42); c.closePath(); c.fillStyle = look.accent; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke(); }
  if (has("bow")) { c.fillStyle = look.accent; c.beginPath(); c.moveTo(32, 10); c.lineTo(22, 5); c.lineTo(22, 15); c.closePath(); c.moveTo(32, 10); c.lineTo(42, 5); c.lineTo(42, 15); c.closePath(); c.fill(); circle(c, 32, 10, 2.5, "#fff"); }
  if (has("badge")) { circle(c, 42, 44, 4.5, look.accent, OUT); c.fillStyle = OUT; c.fillRect(41, 42, 2, 4); }
  if (has("pads")) { rr(c, 8, 34, 14, 9, 4, "#6a7560", OUT); rr(c, 42, 34, 14, 9, 4, "#6a7560", OUT); }
  if (has("satchel")) { c.strokeStyle = "#8a6a3a"; c.lineWidth = 3; c.beginPath(); c.moveTo(18, 38); c.lineTo(46, 58); c.stroke(); rr(c, 38, 48, 14, 11, 3, "#a98450", OUT); }
  if (has("papers")) { rr(c, 40, 46, 13, 15, 2, "#f4f0e0", OUT); c.fillStyle = "#b8b4a0"; for (const y of [50, 53, 56]) c.fillRect(42, y, 9, 1.4); }
  if (has("mug")) { rr(c, 6, 46, 10, 10, 3, "#e8e0d0", OUT); c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.arc(17, 51, 3, -1.2, 1.2); c.stroke(); c.fillStyle = "rgba(255,255,255,0.5)"; c.fillRect(8, 43, 2, 3); c.fillRect(12, 42, 2, 4); }
  if (has("pigeon")) {
    circle(c, 52, 36, 6.5, "#9aa4b8", OUT); circle(c, 56, 31, 3.6, "#9aa4b8", OUT); circle(c, 57, 30, 0.9, OUT);
    c.fillStyle = "#e8b060"; c.beginPath(); c.moveTo(59, 31); c.lineTo(62, 32.5); c.lineTo(59, 33.5); c.fill();
    c.fillStyle = "#6e7890"; c.beginPath(); c.moveTo(46, 36); c.lineTo(41, 40); c.lineTo(47, 41); c.fill();
  }
  if (has("sprout")) { c.strokeStyle = "#3f9a3c"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(52, 58); c.lineTo(52, 48); c.stroke(); c.fillStyle = "#6fd05a"; c.beginPath(); c.ellipse(48, 47, 5, 2.6, -0.5, 0, 7); c.ellipse(56, 45, 5, 2.6, 0.5, 0, 7); c.fill(); }
  // robots and machines
  if (has("antenna")) { c.strokeStyle = OUT; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 9); c.lineTo(32, 2); c.stroke(); circle(c, 32, 3, 3, look.accent, OUT); }
  if (has("cracked_visor")) { c.strokeStyle = "#ff5a5a"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(34, 15); c.lineTo(31, 20); c.lineTo(36, 23); c.lineTo(33, 27); c.stroke(); }
  if (has("chest_lamp")) { circle(c, 32, 44, 4.5, look.accent, OUT); circle(c, 32, 44, 8, "rgba(107,255,154,0.25)"); }
  if (has("wrench")) { c.strokeStyle = "#cfd6e0"; c.lineWidth = 3; c.beginPath(); c.moveTo(10, 56); c.lineTo(4, 38); c.stroke(); c.beginPath(); c.arc(4, 36, 4, 0.3, 5.9); c.stroke(); }
  if (has("wheels")) { for (const x of [18, 46]) { circle(c, x, 56, 7, "#3a3f4c", OUT); circle(c, x, 56, 2.5, look.accent); } }
  if (has("notes")) { c.fillStyle = "#fff6c0"; c.font = "bold 14px monospace"; c.fillText("♪", 46, 14); c.fillText("♫", 6, 20); }
  if (has("number")) { rr(c, 22, 38, 20, 12, 2, "#101420"); c.fillStyle = look.accent; c.font = "bold 11px monospace"; c.fillText("42", 26, 48); }
  if (has("cone")) { c.beginPath(); c.moveTo(32, 0); c.lineTo(44, 14); c.lineTo(20, 14); c.closePath(); c.fillStyle = "#ff9a3c"; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); c.fillStyle = "#fff"; c.fillRect(25, 8, 14, 2.5); }
  if (has("visor_scan")) { c.fillStyle = "rgba(255,107,122,0.55)"; c.fillRect(20, 20, 24, 3); }
  if (has("eye")) {
    circle(c, 32, 26, 12, "#05070f", OUT); circle(c, 32, 26, 8, look.accent); circle(c, 32, 26, 3.5, "#fff");
    c.strokeStyle = "rgba(255,90,90,0.5)"; c.lineWidth = 1.5; c.beginPath(); c.arc(32, 26, 15, 0, 7); c.stroke();
  }
  if (has("train_face")) {
    circle(c, 24, 27, 5, look.accent, OUT); circle(c, 40, 27, 5, look.accent, OUT);
    c.fillStyle = "#14172a"; c.fillRect(22, 15, 20, 4); c.fillStyle = look.accent; c.fillRect(24, 16, 16, 2);
    c.strokeStyle = "#cfd6e0"; c.lineWidth = 3; c.beginPath(); c.moveTo(12, 56); c.lineTo(52, 56); c.stroke();
  }
  if (has("window")) { rr(c, 17, 14, 30, 24, 3, "#0b1220"); c.strokeStyle = look.accent; c.lineWidth = 2; c.strokeRect(19, 16, 26, 20); c.fillStyle = "rgba(123,227,255,0.18)"; c.fillRect(19, 16, 26, 20); c.fillStyle = look.accent; c.fillRect(24, 40, 16, 3); }
  if (has("megaphone")) { c.beginPath(); c.moveTo(18, 24); c.lineTo(46, 12); c.lineTo(46, 40); c.lineTo(18, 30); c.closePath(); c.fillStyle = look.accent; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); rr(c, 10, 22, 10, 10, 3, "#3a4258", OUT); }
}

/** The glow colour of a figure's ring, also used for its name tag. */
export const ringOf = (id: string): string => lookFor(id).ring;

/** Whether a figure bobs, hums or pulses (idle life), and how: a gentle sway for everyone, a pulse for machines. */
export const idleOf = (id: string): "sway" | "pulse" | "hum" => {
  const l = lookFor(id);
  return id === "brindle" ? "hum" : l.form === "machine" ? "pulse" : "sway";
};
