import type { ParsedScene, ParsedScript } from "./types";

export interface ExistingScene {
  id: string;
  scene_no: string;
  int_ext: string | null;
  location_name: string | null;
  time_of_day: string | null;
  page_eighths: number | null;
  body: string | null;
  status: string;
}

export const headingKey = (s: {
  int_ext?: string | null;
  intExt?: string | null;
  location_name?: string | null;
  locationName?: string | null;
  time_of_day?: string | null;
  timeOfDay?: string | null;
}) => [s.int_ext ?? s.intExt ?? "", s.location_name ?? s.locationName ?? "", s.time_of_day ?? s.timeOfDay ?? ""].join("|");

function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const t: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * Pair each scene in the new draft with the scene it replaces.
 * 1. Scenes that are word-for-word identical, kept in script order.
 * 2. Scenes the script itself numbers (locked numbers) with the same number.
 * 3. Same heading (INT/EXT, location, time), nearest in script order.
 * Anything left over is new (draft side) or cut (existing side).
 */
export function matchScenes(existing: ExistingScene[], scenes: ParsedScene[]) {
  const live = existing.filter((e) => e.status !== "cut");
  const matches: (ExistingScene | null)[] = scenes.map(() => null);
  const used = new Set<string>();
  const take = (i: number, e: ExistingScene) => { matches[i] = e; used.add(e.id); };

  // 1. Identical scenes.
  const exKeys = live.map((e) => headingKey(e) + "\n" + (e.body ?? ""));
  const newKeys = scenes.map((s) => headingKey(s) + "\n" + s.body);
  for (const [i, j] of lcsPairs(exKeys, newKeys)) take(j, live[i]);

  // 2. Locked scene numbers (also lets a previously cut scene come back).
  const byNo = new Map(existing.map((e) => [e.scene_no, e]));
  scenes.forEach((s, i) => {
    if (matches[i] || !s.numbered) return;
    const e = byNo.get(s.sceneNo);
    if (e && !used.has(e.id)) take(i, e);
  });

  // 3. Same heading, closest by position.
  const liveIndex = new Map(live.map((e, i) => [e.id, i]));
  scenes.forEach((s, i) => {
    if (matches[i]) return;
    const k = headingKey(s);
    const candidates = live.filter((e) => !used.has(e.id) && headingKey(e) === k);
    if (!candidates.length) return;
    candidates.sort((a, b) => Math.abs(liveIndex.get(a.id)! - i) - Math.abs(liveIndex.get(b.id)! - i));
    take(i, candidates[0]);
  });

  const cut = live.filter((e) => !used.has(e.id));
  return { matches, cut };
}

export interface DiffLine { op: "same" | "add" | "del"; text: string }

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...lcsPairs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < pi) out.push({ op: "del", text: a[i++] });
    while (j < pj) out.push({ op: "add", text: b[j++] });
    if (pi < a.length) { out.push({ op: "same", text: a[pi] }); i++; j++; }
  }
  return out;
}

export type ChangeKind = "added" | "changed" | "unchanged" | "cut";

export interface SceneChange {
  kind: ChangeKind;
  parsed?: ParsedScene;
  existing?: ExistingScene;
  headingChanged: boolean;
  textChanged: boolean;
  renumbered: boolean;
  eighthsDelta: number;
  lines: DiffLine[];
}

export interface Review {
  changes: SceneChange[];
  counts: Record<ChangeKind, number>;
  eighthsBefore: number;
  eighthsAfter: number;
}

export function reviewRevision(existing: ExistingScene[], script: ParsedScript): Review {
  const { matches, cut } = matchScenes(existing, script.scenes);
  const changes: SceneChange[] = script.scenes.map((s, i) => {
    const e = matches[i];
    if (!e) {
      return { kind: "added", parsed: s, headingChanged: false, textChanged: false, renumbered: false, eighthsDelta: s.pageEighths, lines: [] };
    }
    const headingChanged = headingKey(e) !== headingKey(s);
    const textChanged = (e.body ?? "") !== s.body;
    const renumbered = e.scene_no !== s.sceneNo;
    const changed = headingChanged || textChanged;
    return {
      kind: changed ? "changed" : "unchanged",
      parsed: s,
      existing: e,
      headingChanged,
      textChanged,
      renumbered,
      eighthsDelta: s.pageEighths - (e.page_eighths ?? 0),
      lines: textChanged ? lineDiff(e.body ?? "", s.body) : [],
    };
  });
  for (const e of cut) {
    changes.push({ kind: "cut", existing: e, headingChanged: false, textChanged: false, renumbered: false, eighthsDelta: -(e.page_eighths ?? 0), lines: [] });
  }
  const counts: Record<ChangeKind, number> = { added: 0, changed: 0, unchanged: 0, cut: 0 };
  for (const c of changes) counts[c.kind]++;
  return {
    changes,
    counts,
    eighthsBefore: existing.filter((e) => e.status !== "cut").reduce((n, e) => n + (e.page_eighths ?? 0), 0),
    eighthsAfter: script.totalEighths,
  };
}
