import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "./CopyButton";
import {
  addCrewCall,
  createCallSheet,
  markSent,
  publishSheet,
  reissueSheet,
  removeCrewCall,
  saveDetails,
  saveLocation,
} from "./actions";

const t = (v: string | null) => (v ? v.slice(0, 5) : "");
const cell = { padding: "6px 8px", borderBottom: "1px solid #ddd", textAlign: "left" as const, fontSize: 14 };

export default async function DayPage({ params }: { params: Promise<{ id: string; dayId: string }> }) {
  const { id, dayId } = await params;
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("shoot_day")
    .select("id, day_no, shoot_date, general_call, location(name, address)")
    .eq("id", dayId)
    .eq("project_id", id)
    .maybeSingle();
  if (!day) notFound();

  const [{ data: sheets }, { data: entries }] = await Promise.all([
    supabase.from("call_sheet").select("*").eq("shoot_day_id", dayId).order("version_no", { ascending: false }),
    supabase
      .from("schedule_entry")
      .select("position, scene(scene_no, int_ext, location_name, time_of_day, page_eighths, revised_at)")
      .eq("shoot_day_id", dayId)
      .order("position"),
  ]);
  const sheet = sheets?.[0];
  const anyPublished = (sheets ?? []).some((s) => s.published_at);
  const latestPublished = (sheets ?? []).find((s) => s.published_at);
  const staleScenes = latestPublished
    ? (entries ?? []).filter((e) => {
        const r = (e.scene as unknown as { revised_at: string | null }).revised_at;
        return r && new Date(r) > new Date(latestPublished.published_at);
      }).length
    : 0;

  const loc = day.location as unknown as { name: string; address: string | null } | null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  let calls: { id: string; person_id: string; call: string | null; status: string; person: { name: string; kind: string; phone: string | null } }[] = [];
  if (sheet) {
    const { data } = await supabase
      .from("call_time")
      .select("id, person_id, call, status, person(name, kind, phone)")
      .eq("call_sheet_id", sheet.id);
    calls = ((data ?? []) as unknown as typeof calls).sort((a, b) => (a.call ?? "99").localeCompare(b.call ?? "99"));
  }
  const firstPublished = (sheets ?? []).filter((s) => s.published_at).sort((a, b) => a.version_no - b.version_no)[0];
  const link = (personId?: string) => firstPublished ? `${base}/c/${firstPublished.public_token}${personId ? `?p=${personId}` : ""}` : "";

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <p><Link href={`/projects/${id}/schedule`}>&larr; Stripboard</Link></p>
      <h1>Day {day.day_no} call sheet</h1>
      <p>
        {day.shoot_date ?? "No date set"} · {entries?.length ?? 0} scenes
        {loc ? ` · ${loc.name}${loc.address ? ", " + loc.address : ""}` : ""}
      </p>

      {staleScenes > 0 && (
        <p style={{ background: "#fff4e0", border: "1px solid #f0c36d", padding: 10, borderRadius: 6 }}>
          {staleScenes} scene{staleScenes === 1 ? " was" : "s were"} revised in the script after version {latestPublished!.version_no} was published.
          Start a new version, check the scenes below and republish.
        </p>
      )}

      {!sheet ? (
        <form action={createCallSheet.bind(null, id, dayId)}>
          <button type="submit">Create call sheet</button>
        </form>
      ) : (
        <>
          <p>
            <strong>Version {sheet.version_no}</strong>{" "}
            {sheet.published_at ? `· published ${new Date(sheet.published_at).toLocaleString()}` : "· draft (crew can't see it yet)"}
          </p>

          <h2>Location</h2>
          <form action={saveLocation.bind(null, id, dayId)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="name" placeholder="Location name" required defaultValue={loc?.name ?? ""} />
            <input name="address" placeholder="Address" defaultValue={loc?.address ?? ""} style={{ minWidth: 260 }} />
            <button type="submit">Save location</button>
          </form>

          <h2>Details</h2>
          <form action={saveDetails.bind(null, id, dayId, sheet.id)} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <label>General call <input type="time" name="general_call" defaultValue={t(day.general_call)} /></label>
            <label>Sunrise <input type="time" name="sunrise" defaultValue={t(sheet.sunrise)} /></label>
            <label>Sunset <input type="time" name="sunset" defaultValue={t(sheet.sunset)} /></label>
            <label>Weather <input name="weather" defaultValue={(sheet.weather as { summary?: string } | null)?.summary ?? ""} placeholder="e.g. Clear, 54F" /></label>
            <label>Nearest hospital <input name="nearest_hospital" defaultValue={sheet.nearest_hospital ?? ""} style={{ width: "100%" }} /></label>
            <label>Notes <textarea name="notes" rows={3} defaultValue={sheet.notes ?? ""} style={{ width: "100%" }} /></label>
            <div><button type="submit">Save details</button></div>
          </form>

          <h2>Scenes</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {(entries ?? []).map((e, i) => {
                const s = e.scene as unknown as { scene_no: string; int_ext: string; location_name: string; time_of_day: string };
                return (
                  <tr key={i}>
                    <td style={cell}>{s.scene_no}</td>
                    <td style={cell}>{s.int_ext}. {s.location_name} - {s.time_of_day}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(entries?.length ?? 0) === 0 && <p>No scenes scheduled for this day yet. Use the stripboard.</p>}

          <h2>Cast and crew calls</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>{["Name", "Type", "Call", "Status", ""].map((x) => <th key={x} style={cell}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td style={cell}>{c.person.name}</td>
                  <td style={cell}>{c.person.kind}</td>
                  <td style={cell}>{t(c.call)}</td>
                  <td style={cell}>{c.status}</td>
                  <td style={cell}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {firstPublished && <CopyButton text={link(c.person_id)} label="Copy their link" />}
                      {c.status === "draft" && firstPublished && (
                        <form action={markSent.bind(null, id, dayId, sheet.id, c.id)}><button type="submit">Mark sent</button></form>
                      )}
                      <form action={removeCrewCall.bind(null, id, dayId, c.id)}><button type="submit">Remove</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addCrewCall.bind(null, id, dayId, sheet.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
            <input name="name" placeholder="Name" required />
            <select name="kind" defaultValue="crew">
              <option value="cast">cast</option>
              <option value="crew">crew</option>
              <option value="vendor">vendor</option>
            </select>
            <input name="phone" placeholder="Phone (optional)" />
            <input type="time" name="call" aria-label="Call time" />
            <button type="submit">Add</button>
          </form>

          <h2>Publish</h2>
          {!sheet.published_at ? (
            <form action={publishSheet.bind(null, id, dayId, sheet.id)}>
              <button type="submit">Publish version {sheet.version_no}</button>
            </form>
          ) : (
            <>
              <p>
                Everyone with the link below sees the latest published version. To change something, start a new
                version, edit it, then publish; crew will see a banner and are asked to confirm again.
              </p>
              <form action={reissueSheet.bind(null, id, dayId, sheet.id)}>
                <button type="submit">Start version {sheet.version_no + 1}</button>
              </form>
            </>
          )}
          {anyPublished && (
            <div style={{ marginTop: 16 }}>
              Shared link: <input readOnly value={link()} style={{ width: "60%" }} /> <CopyButton text={link()} />
              {calls.some((c) => c.status === "draft") && (
                <form action={markSent.bind(null, id, dayId, sheet.id, undefined)} style={{ display: "inline", marginLeft: 8 }}>
                  <button type="submit">Mark all as sent</button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
