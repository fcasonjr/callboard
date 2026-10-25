"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseScript } from "@/lib/script";
import { importScript } from "@/lib/script/save";

const back = (projectId: string, query: string) => redirect(`/projects/${projectId}?${query}`);
const errorQuery = (e: unknown) =>
  `error=${encodeURIComponent(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Import failed")}`;

export async function uploadScript(projectId: string, formData: FormData) {
  const file = formData.get("script");
  if (!(file instanceof File) || file.size === 0) {
    back(projectId, `error=${encodeURIComponent("Choose a .fountain or .fdx file first.")}`);
    return;
  }
  const text = await file.text();
  const { format, script } = parseScript(file.name, text);
  if (script.scenes.length === 0) {
    back(projectId, `error=${encodeURIComponent("No scenes found in that file.")}`);
    return;
  }
  const supabase = await createClient();
  let target: string;
  try {
    const { count, error } = await supabase
      .from("scene")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .neq("status", "cut");
    if (error) throw error;

    if (!count) {
      // First import: nothing to compare against, so save straight away.
      const s = await importScript(supabase, projectId, script, format, text, file.name);
      target = `/projects/${projectId}?imported=${s.versionNo}&added=${s.added}&changed=0&unchanged=0&cut=0&warnings=${script.warnings.length}`;
    } else {
      // A revision: park it for review before anything changes.
      const { data, error: e2 } = await supabase
        .from("script_import_draft")
        .insert({ project_id: projectId, filename: file.name, source_format: format, raw_source: text })
        .select("id")
        .single();
      if (e2) throw e2;
      target = `/projects/${projectId}/import/${data.id}`;
    }
  } catch (e) {
    target = `/projects/${projectId}?${errorQuery(e)}`;
  }
  redirect(target);
}
