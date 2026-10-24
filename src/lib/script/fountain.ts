import { buildScript, isHeadingText } from "./build";
import type { Block, ParsedScript } from "./types";

const SCENE_NO_RE = /\s*#([^#]+)#\s*$/;

function stripNonPrinting(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "") // boneyard
    .replace(/\[\[[\s\S]*?\]\]/g, ""); // notes
}

function stripEmphasis(t: string): string {
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let prev: string;
  do {
    prev = t;
    t = t.replace(re, (_m, a, b, c, d) => a ?? b ?? c ?? d ?? "");
  } while (t !== prev);
  return t;
}

function isUpperLine(line: string): boolean {
  return /[A-Z]/.test(line) && line === line.toUpperCase();
}

export function parseFountain(source: string): ParsedScript {
  let text = stripNonPrinting(source);
  let title: string | null = null;

  // Title page: leading "Key: value" lines, ended by a blank line.
  const first = text.split("\n\n")[0] ?? "";
  if (/^[A-Za-z ]+:/.test(first.split("\n")[0] ?? "") && !isHeadingText(first.split("\n")[0])) {
    const m = first.match(/^title:\s*([\s\S]*?)(?=^\S[^\n]*:|$(?![\s\S]))/im);
    if (m) title = stripEmphasis(m[1].replace(/\s*\n\s*/g, " ").trim()) || null;
    text = text.slice(first.length);
  }

  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const next = lines[i + 1]?.trim() ?? "";

    if (line === "") { i++; continue; }
    if (/^={3,}$/.test(line)) { i++; continue; } // page break
    if (/^#+\s/.test(line) || /^=\s/.test(line)) { i++; continue; } // section / synopsis

    // Scene heading
    const forcedHeading = line.startsWith(".") && !line.startsWith("..");
    if (prevBlank && (forcedHeading || isHeadingText(line))) {
      let h = forcedHeading ? line.slice(1).trim() : line;
      let sceneNo: string | undefined;
      const sm = h.match(SCENE_NO_RE);
      if (sm) { sceneNo = sm[1]; h = h.replace(SCENE_NO_RE, "").trim(); }
      blocks.push({ type: "heading", text: stripEmphasis(h), sceneNo });
      i++;
      continue;
    }

    // Transition
    if (prevBlank && next === "" && (/^[A-Z .]+TO:$/.test(line) || (line.startsWith(">") && !line.endsWith("<")))) {
      blocks.push({ type: "transition", text: line.replace(/^>\s*/, "") });
      i++;
      continue;
    }

    // Centered text is treated as action
    if (line.startsWith(">") && line.endsWith("<")) {
      blocks.push({ type: "action", text: line.slice(1, -1).trim() });
      i++;
      continue;
    }

    // Character + dialogue
    const forcedChar = line.startsWith("@");
    const charText = forcedChar ? line.slice(1) : line;
    const charCore = charText.replace(/\(.*?\)/g, "").replace(/\^$/, "").trim();
    if (prevBlank && next !== "" && (forcedChar || (isUpperLine(charCore) && charCore.length > 0 && !line.startsWith("!")))) {
      blocks.push({ type: "character", text: charText.trim() });
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        const l = lines[i].trim();
        blocks.push({
          type: /^\(.*\)$/.test(l) ? "parenthetical" : "dialogue",
          text: stripEmphasis(l),
        });
        i++;
      }
      continue;
    }

    // Action: gather until a blank line
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const l = lines[i].trim();
      para.push(stripEmphasis(l.startsWith("!") ? l.slice(1) : l));
      i++;
    }
    blocks.push({ type: "action", text: para.join("\n") });
  }

  return buildScript(title, blocks);
}
