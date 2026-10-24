"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { addShootDay, deleteShootDay, saveLayout, updateShootDay } from "./actions";

export type SbScene = {
  id: string;
  sceneNo: string;
  intExt: string | null;
  location: string | null;
  tod: string | null;
  eighths: number;
  cast: string[];
  est: number | null;
};
export type SbDay = { id: string; dayNo: number; date: string | null; call: string | null; sceneIds: string[] };

const MIN_PER_EIGHTH = 12; // default: about 1.5 hours of shooting per page

function colorClass(s: SbScene) {
  const night = (s.tod ?? "").includes("NIGHT");
  const ext = s.intExt === "EXT";
  return night ? (ext ? "c-ext-night" : "c-int-night") : ext ? "c-ext-day" : "c-int-day";
}

function pagesText(eighths: number) {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  return `${whole ? whole + " " : ""}${rem ? rem + "/8" : whole ? "" : "0"}`.trim();
}

export function Stripboard({
  projectId,
  scenes,
  initialDays,
}: {
  projectId: string;
  scenes: SbScene[];
  initialDays: SbDay[];
}) {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  const scheduled = new Set(initialDays.flatMap((d) => d.sceneIds));

  const [days, setDays] = useState<SbDay[]>(initialDays);
  const [unsched, setUnsched] = useState<string[]>(scenes.filter((s) => !scheduled.has(s.id)).map((s) => s.id));
  const [status, setStatus] = useState<{ text: string; err?: boolean }>({ text: "" });
  const [over, setOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const est = (id: string) => byId.get(id)!.est ?? byId.get(id)!.eighths * MIN_PER_EIGHTH;

  function persist(nextDays: SbDay[]) {
    const layout = nextDays.map((d) => ({
      day_id: d.id,
      scenes: d.sceneIds.map((sid) => ({ scene_id: sid, est_minutes: est(sid) })),
    }));
    setStatus({ text: "Saving..." });
    queue.current = queue.current.then(async () => {
      try {
        const r = await saveLayout(projectId, layout);
        setStatus(r.ok ? { text: "Saved" } : { text: `Not saved: ${r.error}`, err: true });
      } catch (e) {
        setStatus({ text: `Not saved: ${e instanceof Error ? e.message : "network error"}`, err: true });
      }
    });
  }

  function move(id: string, to: string, index?: number) {
    const strip = (l: string[]) => l.filter((x) => x !== id);
    let nextUn = strip(unsched);
    const nextDays = days.map((d) => {
      const rest = strip(d.sceneIds);
      if (d.id !== to) return { ...d, sceneIds: rest };
      const at = index === undefined ? rest.length : Math.min(index, rest.length);
      return { ...d, sceneIds: [...rest.slice(0, at), id, ...rest.slice(at)] };
    });
    if (to === "unsched") nextUn = [...nextUn, id].sort((a, b) => order.get(a)! - order.get(b)!);
    setUnsched(nextUn);
    setDays(nextDays);
    persist(nextDays);
  }

  function nudge(dayId: string, id: string, delta: number) {
    const d = days.find((x) => x.id === dayId)!;
    const i = d.sceneIds.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= d.sceneIds.length) return;
    move(id, dayId, j);
  }

  function dropOn(target: string, index?: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const id = dragId.current ?? e.dataTransfer.getData("text/plain");
      dragId.current = null;
      if (id && byId.has(id)) move(id, target, index);
    };
  }
  const allow = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(key);
  };

  function Strip({ id, dayId }: { id: string; dayId: string | null }) {
    const s = byId.get(id)!;
    const idx = dayId ? days.find((d) => d.id === dayId)!.sceneIds.indexOf(id) : -1;
    return (
      <div
        className={`strip ${colorClass(s)}`}
        draggable
        onDragStart={(e) => {
          dragId.current = id;
          e.dataTransfer.setData("text/plain", id);
        }}
        onDragOver={dayId ? allow(`strip-${id}`) : undefined}
        onDrop={dayId ? dropOn(dayId, idx) : undefined}
      >
        <div className="grow">
          <strong>{s.sceneNo}</strong> {s.intExt}. {s.location} - {s.tod}
          <br />
          <small>
            {pagesText(s.eighths)} pg{s.cast.length ? ` · ${s.cast.join(", ")}` : ""}
          </small>
        </div>
        {dayId && (
          <div className="arrows">
            <button type="button" aria-label="Move up" onClick={() => nudge(dayId, id, -1)}>▲</button>
            <button type="button" aria-label="Move down" onClick={() => nudge(dayId, id, 1)}>▼</button>
          </div>
        )}
        <select
          aria-label={`Move scene ${s.sceneNo} to`}
          value={dayId ?? "unsched"}
          onChange={(e) => move(id, e.target.value)}
        >
          <option value="unsched">Unscheduled</option>
          {days.map((d) => (
            <option key={d.id} value={d.id}>Day {d.dayNo}</option>
          ))}
        </select>
      </div>
    );
  }

  function dayWarnings(d: SbDay) {
    const list = d.sceneIds.map((id) => byId.get(id)!);
    const w: string[] = [];
    let moves = 0;
    for (let i = 1; i < list.length; i++) if (list[i].location !== list[i - 1].location) moves++;
    if (moves > 0) w.push(`${moves} company move${moves > 1 ? "s" : ""}`);
    const hasDay = list.some((s) => !(s.tod ?? "").includes("NIGHT"));
    const hasNight = list.some((s) => (s.tod ?? "").includes("NIGHT"));
    if (hasDay && hasNight) w.push("Day and night scenes in one day");
    const mins = d.sceneIds.reduce((n, id) => n + est(id), 0);
    if (mins > 12 * 60) w.push(`Estimated ${(mins / 60).toFixed(1)} h of shooting`);
    return w;
  }

  return (
    <div>
      <p>
        <button type="button" onClick={() => addShootDay(projectId)}>+ Add shoot day</button>{" "}
        <span className={`saved ${status.err ? "err" : ""}`}>{status.text}</span>
      </p>
      <div className="sb">
        <div
          className={`sb-panel ${over === "unsched" ? "over" : ""}`}
          onDragOver={allow("unsched")}
          onDragLeave={() => setOver(null)}
          onDrop={dropOn("unsched")}
        >
          <strong>Unscheduled ({unsched.length})</strong>
          <div style={{ marginTop: 8 }}>
            {unsched.map((id) => <Strip key={id} id={id} dayId={null} />)}
            {unsched.length === 0 && <p className="saved">Every scene is scheduled.</p>}
          </div>
        </div>

        <div className="sb-days">
          {days.length === 0 && <p>No shoot days yet. Click “Add shoot day”.</p>}
          {days.map((d) => {
            const mins = d.sceneIds.reduce((n, id) => n + est(id), 0);
            const eighths = d.sceneIds.reduce((n, id) => n + byId.get(id)!.eighths, 0);
            const cast = new Set(d.sceneIds.flatMap((id) => byId.get(id)!.cast));
            return (
              <div key={d.id} className="sb-day">
                <div
                  className={`sb-panel ${over === d.id ? "over" : ""}`}
                  onDragOver={allow(d.id)}
                  onDragLeave={() => setOver(null)}
                  onDrop={dropOn(d.id)}
                >
                  <div className="sb-head">
                    <strong>Day {d.dayNo}</strong>
                    <input
                      type="date"
                      defaultValue={d.date ?? ""}
                      aria-label="Shoot date"
                      onBlur={(e) => updateShootDay(projectId, d.id, { shoot_date: e.target.value || null })}
                    />
                    <input
                      type="time"
                      defaultValue={d.call?.slice(0, 5) ?? ""}
                      aria-label="General call"
                      title="General call"
                      onBlur={(e) => updateShootDay(projectId, d.id, { general_call: e.target.value || null })}
                    />
                  </div>
                  <div className="sb-sum">
                    {d.sceneIds.length} scenes · {pagesText(eighths)} pg · ~{(mins / 60).toFixed(1)} h · {cast.size} cast
                  </div>
                  {dayWarnings(d).map((w) => <div key={w} className="sb-warn">{w}</div>)}
                  {d.sceneIds.map((id) => <Strip key={id} id={id} dayId={d.id} />)}
                  <div style={{ marginTop: 8, display: "flex", gap: 10, fontSize: 13 }}>
                    <Link href={`/projects/${projectId}/days/${d.id}`}>Call sheet</Link>
                    {d.sceneIds.length === 0 && (
                      <button type="button" onClick={() => deleteShootDay(projectId, d.id)}>Delete day</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="saved">Drag strips between days, or use the dropdown and arrows (works on a phone). Colors: white INT day, yellow EXT day, blue INT night, green EXT night.</p>
    </div>
  );
}
