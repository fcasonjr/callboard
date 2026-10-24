"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Layout = { day_id: string; scenes: { scene_id: string; est_minutes: number }[] }[];

export async function saveLayout(projectId: string, layout: Layout): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_schedule", { p_project: projectId, p_layout: layout });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addShootDay(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("shoot_day")
    .select("day_no")
    .eq("project_id", projectId)
    .order("day_no", { ascending: false })
    .limit(1);
  const dayNo = (last?.[0]?.day_no ?? 0) + 1;
  const { error } = await supabase.from("shoot_day").insert({ project_id: projectId, day_no: dayNo });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/schedule`);
  return { ok: true };
}

export async function updateShootDay(
  projectId: string,
  dayId: string,
  fields: { shoot_date?: string | null; general_call?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("shoot_day").update(fields).eq("id", dayId).eq("project_id", projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteShootDay(projectId: string, dayId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("shoot_day").delete().eq("id", dayId).eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/schedule`);
  return { ok: true };
}
