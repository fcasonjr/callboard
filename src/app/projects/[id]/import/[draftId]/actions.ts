"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { affectedDays, loadImpact } from "@/lib/script/impact";
import { parseScript, reviewRevision, type ExistingScene } from "@/lib/script";
import { importScript } from "@/lib/script/save";

export async function discardDraft(projectId: string, draftId: string) {
  const supabase = await createClient();
  await supabase.from("script_import_draft").delete().eq("id", draftId).eq("project_id", projectId);
  redirect(`/projects/${projectId}`);
}

export async function applyDraft(projectId: string, draftId: string) {
  const supabase = await createClient();
  let target: string;
  try {
    const { data: draft, error } = await supabase
      .from("script_import_draft")
      .select("filename, source_format, raw_source")
      .eq("id", draftId)
      .eq("project_id", projectId)
      .single();
    if (error) throw error;
    const { format, script } = parseScript(draft.filename, draft.raw_source);

    const { data: rows, error: e2 } = await supabase
      .from("scene")
      .select("id, scene_no, int_ext, location_name, time_of_day, page_eighths, body, status")
      .eq("project_id", projectId);
    if (e2) throw e2;
    const review = reviewRevision((rows ?? []) as ExistingScene[], script);
    const touched = review.changes.filter((c) => (c.kind === "changed" || c.kind === "cut") && c.existing).map((c) => c.existing!.id);
    const impact = await loadImpact(supabase, projectId, touched);
    const reissue = affectedDays([...impact.values()].filter((i) => i.published));

    const s = await importScript(supabase, projectId, script, format, draft.raw_source, draft.filename);
    await supabase.from("script_import_draft").delete().eq("id", draftId);

    const days = reissue.map((d) => `${d.dayId}~${d.dayNo}`).join(",");
    target = `/projects/${projectId}?imported=${s.versionNo}&added=${s.added}&changed=${s.changed}&unchanged=${s.unchanged}&cut=${s.cut}&warnings=${script.warnings.length}${days ? `&reissue=${encodeURIComponent(days)}` : ""}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Import failed";
    target = `/projects/${projectId}/import/${draftId}?error=${encodeURIComponent(msg)}`;
  }
  redirect(target);
}
