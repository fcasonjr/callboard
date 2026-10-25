import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pagesText } from "@/lib/format";
import { affectedDays, loadImpact } from "@/lib/script/impact";
import { parseScript, reviewRevision, type ExistingScene, type SceneChange } from "@/lib/script";
import { applyDraft, discardDraft } from "./actions";

const badge: Record<string, { bg: string; label: string }> = {
  added: { bg: "#d7f0dc", label: "New" },
  changed: { bg: "#fff1b8", label: "Changed" },
  cut: { bg: "#f6d3d0", label: "Cut" },
  unchanged: { bg: "#eee", label: "Unchanged" },
};

function delta(e: number) {
  if (e === 0) return "";
  return `${e > 0 ? "+" : "-"}${pagesText(Math.abs(e))} pg`;
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; draftId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, draftId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("script_import_draft")
    .select("filename, raw_source, created_at")
    .eq("id", draftId)
    .eq("project_id", id)
    .maybeSingle();
  if (!draft) notFound();

  const { script } = parseScript(draft.filename, draft.raw_source);
  const { data: rows } = await supabase
    .from("scene")
    .select("id, scene_no, int_ext, location_name, time_of_day, page_eighths, body, status")
    .eq("project_id", id);
  const review = reviewRevision((rows ?? []) as ExistingScene[], script);

  const touched = review.changes.filter((c) => (c.kind === "changed" || c.kind === "cut") && c.existing).map((c) => c.existing!.id);
  const impact = await loadImpact(supabase, id, touched);
  const impacted = affectedDays([...impact.values()]);
  const needReissue = impacted.filter((d) => d.published);

  const interesting = review.changes.filter((c) => c.kind !== "unchanged");
  const unchanged = review.changes.filter((c) => c.kind === "unchanged");
  const renumbered = unchanged.filter((c) => c.renumbered).length;
  const title = (c: SceneChange) => c.parsed?.heading ?? [c.existing?.int_ext, c.existing?.location_name, c.existing?.time_of_day].filter(Boolean).join(" - ");
  const oldTitle = (c: SceneChange) => [c.existing?.int_ext, c.existing?.location_name, c.existing?.time_of_day].filter(Boolean).join(" - ");

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <p><Link href={`/projects/${id}`}>&larr; Scenes</Link></p>
      <h1>Review new draft</h1>
      <p>
        <strong>{draft.filename}</strong> · {script.scenes.length} scenes, {pagesText(review.eighthsAfter)} pages
        (was {pagesText(review.eighthsBefore)}). Nothing has changed yet.
      </p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["added", "changed", "cut", "unchanged"] as const).map((k) => (
          <span key={k} style={{ background: badge[k].bg, padding: "4px 10px", borderRadius: 12 }}>
            {review.counts[k]} {badge[k].label.toLowerCase()}
          </span>
        ))}
        {renumbered > 0 && <span style={{ background: "#e3e8ff", padding: "4px 10px", borderRadius: 12 }}>{renumbered} renumbered</span>}
      </p>

      {script.warnings.length > 0 && (
        <details style={{ margin: "8px 0" }}>
          <summary>{script.warnings.length} warning(s) in the new file</summary>
          <ul>{script.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      {impacted.length > 0 ? (
        <div style={{ background: "#fff4e0", border: "1px solid #f0c36d", borderRadius: 8, padding: 12, margin: "12px 0" }}>
          <strong>Affects your schedule.</strong>{" "}
          {impact.size} scheduled scene{impact.size === 1 ? "" : "s"} changed or cut, on{" "}
          {impacted.map((d, i) => (
            <span key={d.dayId}>
              {i > 0 && ", "}
              <Link href={`/projects/${id}/days/${d.dayId}`}>Day {d.dayNo}</Link>
            </span>
          ))}
          .{" "}
          {needReissue.length > 0
            ? `Call sheets already published for ${needReissue.map((d) => "Day " + d.dayNo).join(", ")} will need a new version after you apply.`
            : "None of those days have a published call sheet yet."}
        </div>
      ) : (
        <p style={{ color: "#555" }}>No scheduled scenes are affected by this draft.</p>
      )}

      <form action={applyDraft.bind(null, id, draftId)} style={{ display: "inline" }}>
        <button type="submit" style={{ padding: "8px 18px", fontWeight: 600 }}>Apply this draft</button>
      </form>{" "}
      <form action={discardDraft.bind(null, id, draftId)} style={{ display: "inline" }}>
        <button type="submit" style={{ padding: "8px 14px" }}>Discard</button>
      </form>

      <h2>Changes</h2>
      {interesting.length === 0 && <p>No changes: this draft matches the current script.</p>}
      {interesting.map((c, i) => {
        const imp = c.existing ? impact.get(c.existing.id) : undefined;
        return (
          <details key={i} open={c.kind === "changed" || c.kind === "cut"} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", margin: "8px 0", background: "#fff" }}>
            <summary style={{ cursor: "pointer" }}>
              <span style={{ background: badge[c.kind].bg, padding: "2px 8px", borderRadius: 10, marginRight: 8, fontSize: 13 }}>{badge[c.kind].label}</span>
              <strong>{c.parsed?.sceneNo ?? c.existing?.scene_no}</strong> {title(c)}{" "}
              <span style={{ color: "#666", fontSize: 13 }}>{delta(c.eighthsDelta)}</span>
              {c.renumbered && c.existing && (
                <span style={{ color: "#555", fontSize: 13 }}> · was scene {c.existing.scene_no}</span>
              )}
              {imp && (
                <span style={{ marginLeft: 8, fontSize: 13, color: imp.published ? "#8a4b00" : "#555" }}>
                  · on Day {imp.dayNo}{imp.published ? " (call sheet published)" : ""}
                </span>
              )}
            </summary>
            {c.headingChanged && c.existing && (
              <p style={{ fontSize: 14 }}>Heading: <s>{oldTitle(c)}</s> → <strong>{c.parsed!.heading}</strong></p>
            )}
            {c.lines.length > 0 && (
              <pre style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "8px 0" }}>
                {c.lines.map((l, j) => (
                  <div
                    key={j}
                    style={{
                      background: l.op === "add" ? "#e6f6e9" : l.op === "del" ? "#fbe4e2" : "transparent",
                      textDecoration: l.op === "del" ? "line-through" : "none",
                      color: l.op === "same" ? "#777" : "#111",
                    }}
                  >
                    {l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "}
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
            {c.kind === "cut" && <p style={{ fontSize: 14 }}>This scene is not in the new draft. It stays in the project marked cut and leaves the stripboard.</p>}
          </details>
        );
      })}

      {unchanged.length > 0 && (
        <details style={{ margin: "16px 0" }}>
          <summary>{unchanged.length} unchanged scenes</summary>
          <ul style={{ fontSize: 14 }}>
            {unchanged.map((c, i) => (
              <li key={i}>
                {c.parsed!.sceneNo} {c.parsed!.heading}
                {c.renumbered && c.existing && <span style={{ color: "#555" }}> (was {c.existing.scene_no})</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
