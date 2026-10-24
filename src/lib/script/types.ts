export type BlockType =
  | "heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "other";

export interface Block {
  type: BlockType;
  text: string;
  /** Explicit scene number from the script (e.g. "12A"), headings only. */
  sceneNo?: string;
}

export interface ParsedScene {
  sceneNo: string;
  position: number;
  heading: string;
  intExt: "INT" | "EXT" | "INT/EXT" | null;
  locationName: string | null;
  timeOfDay: string | null;
  /** Estimated length in eighths of a page (minimum 1). */
  pageEighths: number;
  /** Scene text without the heading, for display and diffing. */
  body: string;
  /** Speaking characters in order of first appearance, uppercase. */
  characters: string[];
}

export interface ParsedScript {
  title: string | null;
  scenes: ParsedScene[];
  /** Every speaking character with the number of scenes they speak in. */
  characters: { name: string; sceneCount: number }[];
  totalEighths: number;
  warnings: string[];
}
