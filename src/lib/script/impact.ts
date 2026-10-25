import type { SupabaseClient } from "@supabase/supabase-js";

export interface SceneImpact {
  dayId: string;
  dayNo: number;
  published: boolean;
}

/** Which shoot days hold these scenes, and does that day already have a published call sheet? */
export async function loadImpact(
  sb: SupabaseClient,
  projectId: string,
  sceneIds: string[],
): Promise<Map<string, SceneImpact>> {
  const out = new Map<string, SceneImpact>();
  if (!sceneIds.length) return out;
  const { data: entries } = await sb
    .from("schedule_entry")
    .select("scene_id, shoot_day_id, shoot_day(day_no)")
    .eq("project_id", projectId)
    .in("scene_id", sceneIds);
  const { data: sheets } = await sb
    .from("call_sheet")
    .select("shoot_day_id")
    .eq("project_id", projectId)
    .not("published_at", "is", null);
  const publishedDays = new Set((sheets ?? []).map((s) => s.shoot_day_id as string));
  for (const e of entries ?? []) {
    const day = e.shoot_day as unknown as { day_no: number } | null;
    out.set(e.scene_id as string, {
      dayId: e.shoot_day_id as string,
      dayNo: day?.day_no ?? 0,
      published: publishedDays.has(e.shoot_day_id as string),
    });
  }
  return out;
}

export function affectedDays(impacts: Iterable<SceneImpact>) {
  const days = new Map<string, SceneImpact>();
  for (const i of impacts) days.set(i.dayId, i);
  return [...days.values()].sort((a, b) => a.dayNo - b.dayNo);
}
