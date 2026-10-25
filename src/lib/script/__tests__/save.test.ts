import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFountain } from "../index";
import { importScript } from "../save";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the parts of supabase-js that importScript uses. */
function fakeDb() {
  const tables: Record<string, Row[]> = {};
  let n = 0;
  const T = (t: string) => (tables[t] ??= []);
  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: any;
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: [string, boolean] | null = null;
    let lim: number | null = null;
    let single = false;
    let wantRows = false;
    const q: any = {
      select(_c?: string, _o?: any) { if (op !== "select") wantRows = true; return q; },
      insert(v: any) { op = "insert"; payload = Array.isArray(v) ? v : [v]; return q; },
      update(v: any) { op = "update"; payload = v; return q; },
      delete() { op = "delete"; return q; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return q; },
      neq(c: string, v: any) { filters.push((r) => r[c] !== v); return q; },
      in(c: string, vs: any[]) { filters.push((r) => vs.includes(r[c])); return q; },
      order(c: string, o: { ascending: boolean }) { orderBy = [c, o.ascending]; return q; },
      limit(k: number) { lim = k; return q; },
      single() { single = true; return q; },
      then(res: any, rej: any) {
        try {
          const rows = T(table);
          const match = () => rows.filter((r) => filters.every((f) => f(r)));
          let data: any = null;
          if (op === "insert") {
            const added = payload.map((p: Row) => ({ id: `${table}-${++n}`, ...p }));
            rows.push(...added);
            data = wantRows ? added : null;
          } else if (op === "update") {
            const m = match();
            m.forEach((r) => Object.assign(r, payload));
          } else if (op === "delete") {
            const m = new Set(match());
            tables[table] = rows.filter((r) => !m.has(r));
          } else {
            let m = match().map((r) => ({ ...r }));
            if (orderBy) m.sort((a, b) => (a[orderBy![0]] > b[orderBy![0]] ? 1 : -1) * (orderBy![1] ? 1 : -1));
            if (lim !== null) m = m.slice(0, lim);
            data = m;
          }
          if (single) data = Array.isArray(data) ? data[0] : data;
          return Promise.resolve({ data, error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return q;
  };
  return { sb: { from } as any, tables };
}

test("first import then revision: ids are stable, new scene added, schedule kept", async () => {
  const { sb, tables } = fakeDb();
  const v1 = parseFountain(fx("night-shift-v1.fountain"));
  const s1 = await importScript(sb, "p1", v1, "fountain", "raw1", "v1");
  assert.deepEqual([s1.versionNo, s1.added, s1.changed], [1, 4, 0]);
  const idsBefore = Object.fromEntries(tables.scene.map((s) => [s.scene_no, s.id]));
  assert.equal(tables.role.length, 2 + 0 + 0 || tables.role.length); // MARA, DEX

  // schedule scenes 2 and 4, then revise
  tables.schedule_entry = [
    { id: "e1", project_id: "p1", scene_id: idsBefore["2"], shoot_day_id: "d1", position: 0 },
    { id: "e2", project_id: "p1", scene_id: idsBefore["4"], shoot_day_id: "d1", position: 1 },
  ];
  const v2 = parseFountain(fx("night-shift-v2.fountain"));
  const s2 = await importScript(sb, "p1", v2, "fountain", "raw2", "v2");
  assert.deepEqual([s2.versionNo, s2.added, s2.changed, s2.unchanged, s2.cut], [2, 1, 1, 3, 0]);
  for (const no of ["1", "2", "3", "4"]) {
    assert.equal(tables.scene.find((s) => s.scene_no === no)!.id, idsBefore[no], `scene ${no} keeps its id`);
  }
  assert.ok(tables.scene.find((s) => s.scene_no === "3A"));
  assert.equal(tables.schedule_entry.length, 2, "kept scheduled entries");
  assert.equal(tables.script_version.filter((v) => v.is_current).length, 1);
});

test("a scene removed from the draft is cut and leaves the schedule", async () => {
  const { sb, tables } = fakeDb();
  await importScript(sb, "p1", parseFountain(fx("night-shift-v2.fountain")), "fountain", "r", "v2");
  const s3a = tables.scene.find((s) => s.scene_no === "3A")!;
  tables.schedule_entry = [{ id: "e1", project_id: "p1", scene_id: s3a.id, shoot_day_id: "d1", position: 0 }];
  const r = await importScript(sb, "p1", parseFountain(fx("night-shift-v1.fountain")), "fountain", "r", "v1again");
  assert.equal(r.cut, 1);
  assert.equal(tables.scene.find((s) => s.id === s3a.id)!.status, "cut");
  assert.equal(tables.schedule_entry.length, 0);
});

test("cast links are rebuilt without duplicates on re-import", async () => {
  const { sb, tables } = fakeDb();
  const v1 = parseFountain(fx("night-shift-v1.fountain"));
  await importScript(sb, "p1", v1, "fountain", "r", "a");
  const first = tables.scene_cast.length;
  await importScript(sb, "p1", v1, "fountain", "r", "b");
  assert.equal(tables.scene_cast.length, first);
  assert.equal(tables.role.length, new Set(tables.role.map((r) => r.character_name)).size);
});
