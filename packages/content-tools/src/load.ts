import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { composeMentors, mentorIssues, type MentorVoicing } from "@qh/core";
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
  const startPath = join(root, "start.json");
  const start = existsSync(startPath) ? read(startPath, "start.json") : undefined;
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
  // The mentor arc: shared beats voiced four times, composed into each mentor's conversation (CMP-2).
  const mentorDir = join(root, "mentors");
  let composed = dialogues;
  if (existsSync(join(mentorDir, "arc.qdl"))) {
    const arc = readFileSync(join(mentorDir, "arc.qdl"), "utf8");
    const voicings: MentorVoicing[] = [];
    for (const f of readdirSync(mentorDir).filter((n) => n.endsWith(".json")).sort()) {
      const c = read(join(mentorDir, f), `mentors/${f}`);
      if (c) voicings.push(c.data as MentorVoicing);
    }
    for (const m of mentorIssues(arc, voicings)) issues.push({ file: "mentors/arc.qdl", message: m });
    const byId = Object.fromEntries(dialogues.map((d) => [d.file.replace(/^dialogue\//, "").replace(/\.qdl$/, ""), d.text]));
    const out = composeMentors(byId, arc, voicings);
    composed = Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, text]) => ({ file: `dialogue/${id}.qdl`, text }));
  }
  return { bundle: { ...(config ? { config } : {}), ...(start ? { start } : {}), dialogues: composed, maps, files }, issues };
}
