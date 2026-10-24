import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScript } from "../index";
import { parseLength } from "../fdx";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

test("fountain v1: scenes, headings, numbers", () => {
  const { format, script } = parseScript("night-shift-v1.fountain", fx("night-shift-v1.fountain"));
  assert.equal(format, "fountain");
  assert.equal(script.title, "NIGHT SHIFT");
  assert.deepEqual(script.scenes.map((s) => s.sceneNo), ["1", "2", "3", "4"]);
  const [s1, s2, s3, s4] = script.scenes;
  assert.deepEqual([s1.intExt, s1.locationName, s1.timeOfDay], ["INT", "DINER", "NIGHT"]);
  assert.deepEqual([s2.intExt, s2.locationName, s2.timeOfDay], ["EXT", "PARKING LOT", "NIGHT"]);
  assert.equal(s3.intExt, null); // forced heading without INT/EXT
  assert.equal(s3.locationName, "FLASHBACK - MARA'S KITCHEN");
  assert.ok(script.warnings.some((w) => w.includes("Scene 3")));
  assert.equal(s4.timeOfDay, "LATER");
});

test("fountain v1: characters, extensions stripped", () => {
  const { script } = parseScript("a.fountain", fx("night-shift-v1.fountain"));
  assert.deepEqual(script.scenes[0].characters, ["MARA", "DEX"]);
  assert.deepEqual(script.scenes[3].characters, ["MARA"]);
  const mara = script.characters.find((c) => c.name === "MARA")!;
  assert.equal(mara.sceneCount, 3);
});

test("fountain: boneyard and notes are removed, transitions not scenes", () => {
  const { script } = parseScript("a.fountain", fx("night-shift-v1.fountain"));
  assert.ok(!script.scenes[1].body.includes("leans on the hood"));
  assert.ok(script.scenes[0].body.includes("CUT TO:"));
  assert.equal(script.scenes.length, 4);
});

test("page eighths are at least 1 and total adds up", () => {
  const { script } = parseScript("a.fountain", fx("night-shift-v1.fountain"));
  assert.ok(script.scenes.every((s) => s.pageEighths >= 1));
  assert.equal(script.totalEighths, script.scenes.reduce((n, s) => n + s.pageEighths, 0));
});

test("fountain v2 revision: new scene 3A, edited scene 2, same ids otherwise", () => {
  const v1 = parseScript("a.fountain", fx("night-shift-v1.fountain")).script;
  const v2 = parseScript("a.fountain", fx("night-shift-v2.fountain")).script;
  assert.deepEqual(v2.scenes.map((s) => s.sceneNo), ["1", "2", "3", "3A", "4"]);
  assert.notEqual(v1.scenes[1].body, v2.scenes[1].body);
  assert.equal(v1.scenes[0].body, v2.scenes[0].body);
  assert.deepEqual(v2.scenes[3].characters, ["SHERIFF"]);
  assert.equal(v2.scenes[3].intExt, "INT");
});

test("fdx: scenes, characters, entities, INT/EXT", () => {
  const { format, script } = parseScript("short.fdx", fx("short.fdx"));
  assert.equal(format, "fdx");
  assert.equal(script.scenes.length, 2);
  assert.deepEqual(script.scenes[0].characters, ["ANA", "BEN"]);
  assert.ok(script.scenes[0].body.includes("ANA & BEN"));
  assert.equal(script.scenes[1].intExt, "INT/EXT");
  assert.equal(script.scenes[1].locationName, "CAR - MOVING");
  assert.equal(script.scenes[1].timeOfDay, "DAY");
});

test("script with no headings warns", () => {
  const { script } = parseScript("x.fountain", "Just some text.\n\nMore text.");
  assert.equal(script.scenes.length, 0);
  assert.ok(script.warnings.length > 0);
});

test("fdx: uses Final Draft's own scene length when present, estimates otherwise", () => {
  const { script } = parseScript("short.fdx", fx("short.fdx"));
  assert.equal(script.scenes[0].pageEighths, 11); // "1 3/8"
  assert.ok(script.scenes[1].pageEighths >= 1); // no Length attribute: estimated
});

test("parseLength handles whole pages, fractions and mixed", () => {
  assert.equal(parseLength("3"), 24);
  assert.equal(parseLength("5/8"), 5);
  assert.equal(parseLength("2 3/8"), 19);
  assert.equal(parseLength("1/2"), 4);
  assert.equal(parseLength(""), undefined);
  assert.equal(parseLength("abc"), undefined);
});
