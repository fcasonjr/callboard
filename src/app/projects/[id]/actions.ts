"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseScript } from "@/lib/script";
import { importScript } from "@/lib/script/save";

export async function uploadScript(projectId: string, formData: FormData) {
  const file = formData.get("script");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent("Choose a .fountain or .fdx file first.")}`);
  }
  const text = await file.text();
  const { format, script } = parseScript(file.name, text);
  if (script.scenes.length === 0) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent("No scenes found in that file.")}`);
  }
  const supabase = await createClient();
  let query: string;
  try {
    const s = await importScript(supabase, projectId, script, format, text, file.name);
    query = `imported=${s.versionNo}&added=${s.added}&changed=${s.changed}&unchanged=${s.unchanged}&cut=${s.cut}&warnings=${script.warnings.length}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Import failed";
    query = `error=${encodeURIComponent(msg)}`;
  }
  redirect(`/projects/${projectId}?${query}`);
}
