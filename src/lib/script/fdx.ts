import { buildScript } from "./build";
import type { Block, BlockType, ParsedScript } from "./types";

const TYPE_MAP: Record<string, BlockType> = {
  "scene heading": "heading",
  action: "action",
  general: "action",
  shot: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
};

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : undefined;
}

/** Final Draft writes lengths like "3", "5/8" or "2 3/8" (pages and fractions of a page). */
export function parseLength(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^(?:(\d+)(?:\s+|$))?(?:(\d+)\/(\d+))?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  const whole = m[1] ? Number(m[1]) : 0;
  const frac = m[2] ? Math.round((Number(m[2]) * 8) / Number(m[3])) : 0;
  const total = whole * 8 + frac;
  return total > 0 ? total : undefined;
}

export function parseFdx(xml: string): ParsedScript {
  const content = xml.match(/<Content[\s>][\s\S]*?<\/Content>/i)?.[0] ?? xml;
  const blocks: Block[] = [];
  const paraRe = /<Paragraph\b([^>]*?)(\/>|>([\s\S]*?)<\/Paragraph>)/gi;
  let m: RegExpExecArray | null;

  while ((m = paraRe.exec(content))) {
    const open = m[1];
    const inner = m[3] ?? "";
    const typeName = (attr(open, "Type") ?? "Action").toLowerCase();
    const type = TYPE_MAP[typeName] ?? "other";

    let text = "";
    const textRe = /<Text\b[^>]*?(?:\/>|>([\s\S]*?)<\/Text>)/gi;
    let t: RegExpExecArray | null;
    while ((t = textRe.exec(inner))) text += decode(t[1] ?? "");
    text = text.trim();
    if (!text) continue;
    if (type === "other") continue;

    const block: Block = { type, text };
    if (type === "heading") {
      const props = inner.match(/<SceneProperties\b[^>]*>/i)?.[0] ?? "";
      block.sceneNo = attr(open, "Number") ?? attr(props, "Number");
      block.lengthEighths = parseLength(attr(props, "Length"));
    }
    blocks.push(block);
  }

  const title = decode(
    xml.match(/<TitlePage[\s\S]*?<Text[^>]*>([^<]+)<\/Text>/i)?.[1] ?? "",
  ).trim();
  return buildScript(title || null, blocks);
}
