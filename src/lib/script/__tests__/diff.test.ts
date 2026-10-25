import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFountain, reviewRevision, lineDiff, type ExistingScene } from "../index";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

function asExisting(src: string): ExistingScene[] {
  return parseFountain(src).scenes.map((s, i) => ({
    id: `id-${i}-${s.sceneNo}`,
    scene_no: s.sceneNo,
    int_ext: s.intExt,
    location_name: s.locationName,
    time_of_day: s.timeOfDay,
    page_eighths: s.pageEighths,
    body: s.body,
    status: "unscheduled",
  }));
}

test("revision: scene 2 changed, 3A added, others unchanged", () => {
  const existing = asExisting(fx("night-shift-v1.fountain"));
  const r = reviewRevision(existing, parseFountain(fx("night-shift-v2.fountain")));
  assert.deepEqual(r.counts, { added: 1, changed: 1, unchanged: 3, cut: 0 });
  const added = r.changes.find((c) => c.kind === "added")!;
  assert.equal(added.parsed!.sceneNo, "3A");
  const changed = r.changes.find((c) => c.kind === "changed")!;
  assert.equal(changed.existing!.scene_no, "2");
  assert.ok(changed.lines.some((l) => l.op === "add" && l.text.includes("SHERIFF")));
  assert.ok(changed.lines.some((l) => l.op === "del"));
});

test("reversed revision: scene 3A is cut", () => {
  const existing = asExisting(fx("night-shift-v2.fountain"));
  const r = reviewRevision(existing, parseFountain(fx("night-shift-v1.fountain")));
  assert.equal(r.counts.cut, 1);
  assert.equal(r.changes.find((c) => c.kind === "cut")!.existing!.scene_no, "3A");
});

test("unnumbered script: inserting a scene early does not mark everything changed", () => {
  const base = `INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n\nINT. C - DAY\n\nThree.\n`;
  const withNew = `INT. A - DAY\n\nOne.\n\nINT. NEW - DAY\n\nFresh.\n\nINT. B - DAY\n\nTwo.\n\nINT. C - DAY\n\nThree.\n`;
  const r = reviewRevision(asExisting(base), parseFountain(withNew));
  assert.deepEqual(r.counts, { added: 1, changed: 0, unchanged: 3, cut: 0 });
  const renumbered = r.changes.filter((c) => c.renumbered).map((c) => c.parsed!.heading);
  assert.deepEqual(renumbered, ["INT. B - DAY", "INT. C - DAY"]);
});

test("edited scene with same heading still matches in an unnumbered script", () => {
  const base = `INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n`;
  const edited = `INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo, rewritten.\n`;
  const r = reviewRevision(asExisting(base), parseFountain(edited));
  assert.deepEqual(r.counts, { added: 0, changed: 1, unchanged: 1, cut: 0 });
});

test("changing a heading is reported as heading change", () => {
  const base = `INT. A - DAY #1#\n\nOne.\n`;
  const next = `EXT. A - NIGHT #1#\n\nOne.\n`;
  const r = reviewRevision(asExisting(base), parseFountain(next));
  assert.equal(r.changes[0].kind, "changed");
  assert.equal(r.changes[0].headingChanged, true);
  assert.equal(r.changes[0].textChanged, false);
});

test("lineDiff basics", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nx\nc").map((l) => l.op + ":" + l.text), ["same:a", "del:b", "add:x", "same:c"]);
  assert.deepEqual(lineDiff("", "a").map((l) => l.op), ["add"]);
});
