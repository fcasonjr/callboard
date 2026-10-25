import type { Block, ParsedScene, ParsedScript } from "./types";

const HEADING_RE = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)[\s.]+(.*)$/i;

export function isHeadingText(line: string): boolean {
  return HEADING_RE.test(line.trim());
}

export function parseHeading(heading: string): {
  intExt: ParsedScene["intExt"];
  locationName: string | null;
  timeOfDay: string | null;
} {
  const m = heading.trim().match(HEADING_RE);
  if (!m) return { intExt: null, locationName: heading.trim() || null, timeOfDay: null };
  const prefix = m[1].toUpperCase().replace(/\./g, "");
  const intExt =
    prefix === "INT" ? "INT" : prefix === "EXT" || prefix === "EST" ? "EXT" : "INT/EXT";
  const rest = m[2].trim();
  const idx = rest.lastIndexOf(" - ");
  const alt = idx === -1 ? rest.lastIndexOf(" -- ") : -1;
  const cut = idx !== -1 ? idx : alt;
  if (cut === -1) return { intExt, locationName: rest || null, timeOfDay: null };
  const sep = idx !== -1 ? 3 : 4;
  return {
    intExt,
    locationName: rest.slice(0, cut).trim() || null,
    timeOfDay: rest.slice(cut + sep).trim().toUpperCase() || null,
  };
}

export function cleanCharacterName(raw: string): string {
  return raw
    .replace(/\^$/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// ~55 lines of 12pt Courier per page, 8 eighths per page.
const LINES_PER_PAGE = 55;

function wrapLines(text: string, width: number): number {
  return text
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);
}

function blockLines(b: Block): number {
  switch (b.type) {
    case "heading":
      return wrapLines(b.text, 60) + 1;
    case "action":
      return wrapLines(b.text, 60) + 1;
    case "character":
      return 1;
    case "parenthetical":
      return 1;
    case "dialogue":
      return wrapLines(b.text, 35) + 1;
    case "transition":
      return 2;
    default:
      return wrapLines(b.text, 60) + 1;
  }
}

export function estimateEighths(blocks: Block[]): number {
  const lines = blocks.reduce((n, b) => n + blockLines(b), 0);
  return Math.max(1, Math.ceil((lines / LINES_PER_PAGE) * 8));
}

function renderBody(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type !== "heading")
    .map((b) => (b.type === "character" ? b.text.toUpperCase() : b.text))
    .join("\n");
}

export function buildScript(title: string | null, blocks: Block[]): ParsedScript {
  const warnings: string[] = [];
  const groups: { heading: Block; blocks: Block[] }[] = [];
  let preamble = 0;

  for (const b of blocks) {
    if (b.type === "heading") groups.push({ heading: b, blocks: [b] });
    else if (groups.length) groups[groups.length - 1].blocks.push(b);
    else preamble++;
  }
  if (preamble > 0 && groups.length > 0) {
    warnings.push(`${preamble} block(s) before the first scene heading were ignored.`);
  }
  if (groups.length === 0) warnings.push("No scene headings were found.");

  const seen = new Set<string>();
  const scenes: ParsedScene[] = groups.map((g, i) => {
    let sceneNo = g.heading.sceneNo?.trim() || String(i + 1);
    let numbered = !!g.heading.sceneNo?.trim();
    if (seen.has(sceneNo)) {
      numbered = false;
      warnings.push(`Duplicate scene number ${sceneNo}; renumbered to ${i + 1}.`);
      sceneNo = String(i + 1);
    }
    seen.add(sceneNo);
    const { intExt, locationName, timeOfDay } = parseHeading(g.heading.text);
    if (!intExt) warnings.push(`Scene ${sceneNo} ("${g.heading.text.trim()}") has no INT/EXT; check it.`);
    const chars: string[] = [];
    for (const b of g.blocks) {
      if (b.type !== "character") continue;
      const name = cleanCharacterName(b.text);
      if (name && !chars.includes(name)) chars.push(name);
    }
    return {
      sceneNo,
      numbered,
      position: i + 1,
      heading: g.heading.text.trim(),
      intExt,
      locationName,
      timeOfDay,
      pageEighths: g.heading.lengthEighths ?? estimateEighths(g.blocks),
      body: renderBody(g.blocks),
      characters: chars,
    };
  });

  const counts = new Map<string, number>();
  for (const s of scenes) for (const c of s.characters) counts.set(c, (counts.get(c) ?? 0) + 1);
  const characters = [...counts.entries()]
    .map(([name, sceneCount]) => ({ name, sceneCount }))
    .sort((a, b) => b.sceneCount - a.sceneCount || a.name.localeCompare(b.name));

  return {
    title,
    scenes,
    characters,
    totalEighths: scenes.reduce((n, s) => n + s.pageEighths, 0),
    warnings,
  };
}
