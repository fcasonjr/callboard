import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uploadScript } from "./actions";
import { pagesText } from "@/lib/format";
import { Nav } from "./Nav";

type SceneRow = {
  id: string;
  scene_no: string;
  position: number;
  int_ext: string | null;
  location_name: string | null;
  time_of_day: string | null;
  page_eighths: number | null;
  status: string;
  changed_since_breakdown: boolean;
  scene_cast: { role: { character_name: string | null } | null }[];
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const supabase = await createClient();

  const { data: project } = await supabase.from("project").select("id, title").eq("id", id).maybeSingle();
  if (!project) notFound();

  const { data } = await supabase
    .from("scene")
    .select("id, scene_no, position, int_ext, location_name, time_of_day, page_eighths, status, changed_since_breakdown, scene_cast(role(character_name))")
    .eq("project_id", id)
    .order("position");
  const scenes = (data ?? []) as unknown as SceneRow[];
  const live = scenes.filter((s) => s.status !== "cut");
  const totalEighths = live.reduce((n, s) => n + (s.page_eighths ?? 0), 0);

  const { data: drafts } = await supabase
    .from("script_import_draft")
    .select("id, filename, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  const reissue = (q.reissue ?? "")
    .split(",")
    .filter(Boolean)
    .map((x) => x.split("~"))
    .filter((x) => x.length === 2);

  const upload = uploadScript.bind(null, id);
  const cell = { padding: "6px 10px", borderBottom: "1px solid #ddd", textAlign: "left" as const };

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <p><Link href="/">&larr; Projects</Link></p>
      <h1>{project.title}</h1>
      <Nav id={id} active="scenes" />

      {q.error && <p style={{ color: "#b00020" }}>{q.error}</p>}
      {q.imported && (
        <p style={{ background: "#e8f5e9", padding: 10 }}>
          Imported as version {q.imported}: {q.added} new, {q.changed} changed, {q.unchanged} unchanged, {q.cut} cut.
          {Number(q.warnings) > 0 && ` ${q.warnings} warning(s): check scene headings.`}
        </p>
      )}

      {reissue.length > 0 && (
        <p style={{ background: "#fff4e0", border: "1px solid #f0c36d", padding: 10, borderRadius: 6 }}>
          Scenes on a published call sheet changed. Start a new version and republish:{" "}
          {reissue.map(([dayId, dayNo], i) => (
            <span key={dayId}>
              {i > 0 && ", "}
              <Link href={`/projects/${id}/days/${dayId}`}>Day {dayNo}</Link>
            </span>
          ))}
        </p>
      )}
      {(drafts ?? []).map((d) => (
        <p key={d.id} style={{ background: "#e8f0ff", padding: 10, borderRadius: 6 }}>
          Uploaded draft waiting for review: <strong>{d.filename}</strong>{" "}
          <Link href={`/projects/${id}/import/${d.id}`}>Review it</Link>
        </p>
      ))}

      <form action={upload} style={{ margin: "16px 0" }}>
        <input type="file" name="script" accept=".fountain,.fdx,.txt" required />
        <button type="submit" style={{ padding: "6px 14px", marginLeft: 8 }}>
          {live.length ? "Import revision" : "Import script"}
        </button>
      </form>

      {live.length > 0 && (
        <p>{live.length} scenes, about {pagesText(totalEighths)} pages</p>
      )}

      {scenes.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Sc", "I/E", "Location", "Time", "Pages", "Cast"].map((h) => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.map((s) => (
              <tr key={s.id} style={{ opacity: s.status === "cut" ? 0.4 : 1, textDecoration: s.status === "cut" ? "line-through" : "none" }}>
                <td style={cell}>{s.scene_no}{s.changed_since_breakdown ? " *" : ""}</td>
                <td style={cell}>{s.int_ext}</td>
                <td style={cell}>{s.location_name}</td>
                <td style={cell}>{s.time_of_day}</td>
                <td style={cell}>{pagesText(s.page_eighths)}</td>
                <td style={cell}>
                  {s.scene_cast.map((c) => c.role?.character_name).filter(Boolean).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
