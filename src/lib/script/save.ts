import type { SupabaseClient } from "@supabase/supabase-js";
import { headingKey, matchScenes, type ExistingScene } from "./diff";
import type { ParsedScript } from "./types";

export interface ImportSummary {
  versionNo: number;
  added: number;
  changed: number;
  unchanged: number;
  cut: number;
}

/**
 * Save a parsed script as a new version. Scenes keep their internal id across
 * revisions: matched by scene number first, then by heading. Scenes missing from
 * the new draft are marked 'cut' (never deleted, so schedule history survives).
 */
export async function importScript(
  sb: SupabaseClient,
  projectId: string,
  script: ParsedScript,
  format: "fountain" | "fdx",
  rawSource: string,
  label?: string,
): Promise<ImportSummary> {
  const { data: last, error: e0 } = await sb
    .from("script_version")
    .select("version_no")
    .eq("project_id", projectId)
    .order("version_no", { ascending: false })
    .limit(1);
  if (e0) throw e0;
  const versionNo = (last?.[0]?.version_no ?? 0) + 1;

  const { error: e1 } = await sb.from("script_version").update({ is_current: false }).eq("project_id", projectId).eq("is_current", true);
  if (e1) throw e1;
  const { data: ver, error: e2 } = await sb
    .from("script_version")
    .insert({ project_id: projectId, version_no: versionNo, label: label ?? null, source_format: format, raw_source: rawSource, is_current: true })
    .select("id")
    .single();
  if (e2) throw e2;

  const { data: existingRows, error: e3 } = await sb
    .from("scene")
    .select("id, scene_no, int_ext, location_name, time_of_day, page_eighths, body, status")
    .eq("project_id", projectId);
  if (e3) throw e3;
  const existing = (existingRows ?? []) as ExistingScene[];
  const { matches, cut } = matchScenes(existing, script.scenes);
  const summary: ImportSummary = { versionNo, added: 0, changed: 0, unchanged: 0, cut: 0 };
  const sceneIds = new Map<number, string>();

  for (let i = 0; i < script.scenes.length; i++) {
    const s = script.scenes[i];
    const match = matches[i];
    const fields = {
      script_version_id: ver.id,
      scene_no: s.sceneNo,
      position: s.position,
      int_ext: s.intExt,
      location_name: s.locationName,
      time_of_day: s.timeOfDay,
      page_eighths: s.pageEighths,
      body: s.body,
    };
    if (match) {
      const same = (match.body ?? "") === s.body && headingKey(match) === headingKey(s);
      if (same) summary.unchanged++; else summary.changed++;
      const { error } = await sb.from("scene").update({ ...fields, status: match.status === "cut" ? "unscheduled" : match.status }).eq("id", match.id);
      if (error) throw error;
      sceneIds.set(i, match.id);
    } else {
      const { data, error } = await sb.from("scene").insert({ project_id: projectId, ...fields }).select("id").single();
      if (error) throw error;
      summary.added++;
      sceneIds.set(i, data.id);
    }
  }

  // Cut scenes stay in the database (marked cut) and leave the schedule.
  const gone = cut.map((e) => e.id);
  if (gone.length) {
    const { error: e6 } = await sb.from("schedule_entry").delete().in("scene_id", gone);
    if (e6) throw e6;
    const { error } = await sb.from("scene").update({ status: "cut" }).in("id", gone);
    if (error) throw error;
    summary.cut = gone.length;
  }

  // Characters -> roles, and who speaks in each scene.
  const { data: roleRows, error: e4 } = await sb.from("role").select("id, character_name").eq("project_id", projectId);
  if (e4) throw e4;
  const roleIds = new Map((roleRows ?? []).map((r) => [String(r.character_name).toUpperCase(), r.id as string]));
  const newRoles = script.characters.filter((c) => !roleIds.has(c.name)).map((c) => ({ project_id: projectId, character_name: c.name }));
  if (newRoles.length) {
    const { data, error } = await sb.from("role").insert(newRoles).select("id, character_name");
    if (error) throw error;
    for (const r of data ?? []) roleIds.set(String(r.character_name).toUpperCase(), r.id);
  }

  const allIds = [...sceneIds.values()];
  if (allIds.length) {
    const { error } = await sb.from("scene_cast").delete().in("scene_id", allIds);
    if (error) throw error;
    const links = script.scenes.flatMap((s, i) =>
      s.characters.map((c) => ({ project_id: projectId, scene_id: sceneIds.get(i)!, role_id: roleIds.get(c)! })),
    );
    if (links.length) {
      const { error: e5 } = await sb.from("scene_cast").insert(links);
      if (e5) throw e5;
    }
  }
  return summary;
}
