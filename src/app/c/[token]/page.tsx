import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { OfflineBanner, ConfirmForm } from "./OfflineBits";

export const dynamic = "force-dynamic";

type Sheet = {
  call_sheet: { version_no: number; published_at: string; weather: { summary?: string } | null; sunrise: string | null; sunset: string | null; nearest_hospital: string | null; notes: string | null };
  project_title: string;
  day: { day_no: number; shoot_date: string | null; general_call: string | null };
  location: { name: string; address: string | null; contact: string | null } | null;
  scenes: { scene_no: string; int_ext: string | null; location_name: string | null; time_of_day: string | null; page_eighths: number | null; est_minutes: number | null }[];
  calls: { person_id: string; name: string; kind: string; call: string | null; status: string }[];
};

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function confirm(token: string, person: string) {
  "use server";
  await anon().rpc("confirm_call", { p_token: token, p_person: person });
  revalidatePath(`/c/${token}`);
}

const hm = (t: string | null) => {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const colorClass = (s: Sheet["scenes"][number]) => {
  const night = (s.time_of_day ?? "").includes("NIGHT");
  const ext = s.int_ext === "EXT";
  return night ? (ext ? "c-ext-night" : "c-int-night") : ext ? "c-ext-day" : "c-int-day";
};
const pg = (e: number | null) => (e ? `${Math.floor(e / 8) ? Math.floor(e / 8) + " " : ""}${e % 8 ? (e % 8) + "/8" : ""}`.trim() : "");

export default async function PublicCallSheet({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;
  const person = p && /^[0-9a-f-]{36}$/i.test(p) ? p : null;

  const { data } = await anon().rpc("get_public_call_sheet", { p_token: token, p_person: person });
  const sheet = data as Sheet | null;
  const savedAt = new Date().toISOString();

  if (!sheet) {
    return (
      <main className="cs">
        <h1>Call sheet not available</h1>
        <p>This link isn't valid, or the call sheet hasn't been published yet. Ask production for a new link.</p>
      </main>
    );
  }

  const me = person ? sheet.calls.find((c) => c.person_id === person) : undefined;
  const v = sheet.call_sheet.version_no;

  return (
    <main className="cs">
      <style>{css}</style>
      <OfflineBanner savedAt={savedAt} version={v} />
      <p className="cs-small">{sheet.project_title}</p>
      <h1>
        Day {sheet.day.day_no}
        {sheet.day.shoot_date ? ` · ${new Date(sheet.day.shoot_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}` : ""}
      </h1>
      <p className="cs-small">Version {v} · updated {new Date(sheet.call_sheet.published_at).toLocaleString()}</p>
      {v > 1 && <div className="cs-change">This is an updated call sheet (version {v}). Check your call time and the scenes.</div>}

      {me && (
        <div className="cs-me">
          <div>Your call</div>
          <strong>{hm(me.call)}</strong>
          {me.status === "confirmed" ? (
            <div className="cs-ok">Confirmed ✓</div>
          ) : (
            <ConfirmForm action={confirm.bind(null, token, me.person_id)} name={me.name.split(" ")[0]} />
          )}
        </div>
      )}

      <div className="cs-card">
        <div className="cs-small">General call</div>
        <div className="cs-big">{hm(sheet.day.general_call)}</div>
      </div>

      {sheet.location && (
        <div className="cs-card">
          <div className="cs-small">Location</div>
          <strong>{sheet.location.name}</strong>
          {sheet.location.address && (
            <div>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(sheet.location.address)}`}>{sheet.location.address}</a>
            </div>
          )}
        </div>
      )}

      <div className="cs-card cs-grid">
        <div><div className="cs-small">Sunrise</div>{hm(sheet.call_sheet.sunrise)}</div>
        <div><div className="cs-small">Sunset</div>{hm(sheet.call_sheet.sunset)}</div>
        <div><div className="cs-small">Weather</div>{sheet.call_sheet.weather?.summary ?? "TBD"}</div>
      </div>

      {sheet.call_sheet.nearest_hospital && (
        <div className="cs-card"><div className="cs-small">Nearest hospital</div>{sheet.call_sheet.nearest_hospital}</div>
      )}
      {sheet.call_sheet.notes && (
        <div className="cs-card"><div className="cs-small">Notes</div><div style={{ whiteSpace: "pre-wrap" }}>{sheet.call_sheet.notes}</div></div>
      )}

      <h2>Scenes</h2>
      {sheet.scenes.map((s) => (
        <div key={s.scene_no} className={`cs-scene ${colorClass(s)}`}>
          <strong>{s.scene_no}</strong> {s.int_ext}. {s.location_name} - {s.time_of_day}
          <span className="cs-small"> {pg(s.page_eighths) ? `· ${pg(s.page_eighths)} pg` : ""}</span>
        </div>
      ))}

      <h2>Calls</h2>
      <table className="cs-calls">
        <tbody>
          {sheet.calls.map((c) => (
            <tr key={c.person_id} className={c.person_id === person ? "me" : ""}>
              <td>{c.name}</td>
              <td className="cs-small">{c.kind}</td>
              <td style={{ textAlign: "right" }}>{hm(c.call)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const css = `
.cs{max-width:520px;margin:0 auto;padding:12px 16px 48px;font-size:17px}
.cs h1{margin:4px 0}.cs h2{margin:24px 0 8px;font-size:18px}
.cs-small{font-size:13px;color:#666}
.cs-big{font-size:30px;font-weight:700}
.cs-card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px;margin:10px 0}
.cs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:15px}
.cs-me{background:#e8f0ff;border:2px solid #1f4fd8;border-radius:12px;padding:14px;margin:12px 0;text-align:center}
.cs-me strong{display:block;font-size:40px}
.cs-confirm{margin-top:10px;padding:12px 18px;font-size:17px;border-radius:8px;border:0;background:#1f4fd8;color:#fff;width:100%}
.cs-confirm:disabled{background:#999}
.cs-ok{margin-top:8px;font-weight:700;color:#1b7a2b}
.cs-change{background:#fff4e0;border:1px solid #f0c36d;border-radius:8px;padding:10px;margin:10px 0}
.cs-offline{position:sticky;top:0;z-index:5;background:#333;color:#fff;padding:8px 12px;border-radius:0 0 8px 8px;font-size:14px}
.cs-scene{border:1px solid #888;border-radius:4px;padding:6px 8px;margin-bottom:5px;font-size:15px}
.cs-calls{width:100%;border-collapse:collapse}.cs-calls td{padding:7px 4px;border-bottom:1px solid #ddd}
.cs-calls tr.me{background:#e8f0ff;font-weight:700}
`;
