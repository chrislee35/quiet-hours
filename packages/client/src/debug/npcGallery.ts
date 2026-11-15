// Debug builds only (?npcs): every named figure on one sheet, for reviewing how people look.
import { NPC_LOOKS, drawLook, lookFor } from "../render/npcLooks.ts";

export function mountNpcGallery(): void {
  document.body.innerHTML = "";
  Object.assign(document.body.style, { background: "#161a2a", margin: "0", padding: "16px", color: "#c8cce6", font: "12px monospace" });
  const grid = document.createElement("div");
  Object.assign(grid.style, { display: "grid", gridTemplateColumns: "repeat(10, 128px)", gap: "10px" });
  for (const id of Object.keys(NPC_LOOKS)) {
    const cell = document.createElement("div");
    cell.style.textAlign = "center";
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    c.style.cssText = `width:128px;height:128px;background:#0f1220;border-radius:10px;border:2px solid ${lookFor(id).ring}`;
    drawLook(c.getContext("2d")!, lookFor(id));
    cell.append(c, Object.assign(document.createElement("div"), { textContent: id }));
    grid.append(cell);
  }
  document.body.append(grid);
}
