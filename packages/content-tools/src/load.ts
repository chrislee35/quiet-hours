import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kinds, type Kind } from "./schemas.ts";
import type { ContentBundle, ContentFile, Issue } from "./validate.ts";

/** Reads content/ from disk. Unparseable JSON becomes an Issue instead of throwing. */
export function loadContent(root: string): { bundle: ContentBundle; issues: Issue[] } {
  const issues: Issue[] = [];
  const read = (path: string, file: string): ContentFile | undefined => {
    try {
      return { file, data: JSON.parse(readFileSync(path, "utf8")) };
    } catch (e) {
      issues.push({ file, message: `cannot parse JSON: ${(e as Error).message}` });
      return undefined;
    }
  };

  const configPath = join(root, "config", "tuning.json");
  const config = existsSync(configPath) ? read(configPath, "config/tuning.json") : undefined;
  if (!existsSync(configPath)) issues.push({ file: "config/tuning.json", message: "missing" });

  const files = {} as Record<Kind, ContentFile[]>;
  for (const kind of Object.keys(kinds) as Kind[]) {
    const dir = join(root, kind);
    files[kind] = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .map((f) => read(join(dir, f), `${kind}/${f}`))
          .filter((f): f is ContentFile => f !== undefined)
      : [];
  }
  const mapDir = join(root, "maps");
  const maps = existsSync(mapDir)
    ? readdirSync(mapDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => read(join(mapDir, f), `maps/${f}`))
        .filter((f): f is ContentFile => f !== undefined)
    : [];
  const dialogueDir = join(root, "dialogue");
  const dialogues = existsSync(dialogueDir)
    ? readdirSync(dialogueDir)
        .filter((f) => f.endsWith(".qdl"))
        .sort()
        .map((f) => ({ file: `dialogue/${f}`, text: readFileSync(join(dialogueDir, f), "utf8") }))
    : [];
  return { bundle: { ...(config ? { config } : {}), dialogues, maps, files }, issues };
}
