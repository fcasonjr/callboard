import { parseFdx } from "./fdx";
import { parseFountain } from "./fountain";
import type { ParsedScript } from "./types";

export type SourceFormat = "fountain" | "fdx";

export function detectFormat(filename: string, content: string): SourceFormat {
  if (/\.fdx$/i.test(filename) || /<FinalDraft\b/i.test(content.slice(0, 2000))) return "fdx";
  return "fountain";
}

export function parseScript(filename: string, content: string): { format: SourceFormat; script: ParsedScript } {
  const format = detectFormat(filename, content);
  return { format, script: format === "fdx" ? parseFdx(content) : parseFountain(content) };
}

export * from "./types";
export { parseFountain, parseFdx };
