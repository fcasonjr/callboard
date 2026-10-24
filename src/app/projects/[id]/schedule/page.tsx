import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "../Nav";
import { Stripboard, type SbDay, type SbScene } from "./Stripboard";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase.from("project").select("id, title").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [{ data: sceneRows }, { data: dayRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("scene")
      .select("id, scene_no, position, int_ext, location_name, time_of_day, page_eighths, scene_cast(role(character_name))")
      .eq("project_id", id)
      .neq("status", "cut")
      .order("position"),
    supabase.from("shoot_day").select("id, day_no, shoot_date, general_call").eq("project_id", id).order("day_no"),
    supabase.from("schedule_entry").select("shoot_day_id, scene_id, position, est_minutes").eq("project_id", id).order("position"),
  ]);

  const estByScene = new Map((entryRows ?? []).map((e) => [e.scene_id as string, e.est_minutes as number | null]));
  const scenes: SbScene[] = (sceneRows ?? []).map((s) => ({
    id: s.id,
    sceneNo: s.scene_no,
    intExt: s.int_ext,
    location: s.location_name,
    tod: s.time_of_day,
    eighths: s.page_eighths ?? 1,
    cast: ((s.scene_cast ?? []) as unknown as { role: { character_name: string | null } | null }[])
      .map((c) => c.role?.character_name)
      .filter((x): x is string => !!x),
    est: estByScene.get(s.id) ?? null,
  }));
  const valid = new Set(scenes.map((s) => s.id));
  const days: SbDay[] = (dayRows ?? []).map((d) => ({
    id: d.id,
    dayNo: d.day_no,
    date: d.shoot_date,
    call: d.general_call,
    sceneIds: (entryRows ?? []).filter((e) => e.shoot_day_id === d.id && valid.has(e.scene_id)).map((e) => e.scene_id as string),
  }));

  return (
    <main style={{ maxWidth: 1400, margin: "32px auto", padding: "0 16px" }}>
      <p><Link href="/">&larr; Projects</Link></p>
      <h1>{project.title}</h1>
      <Nav id={id} active="schedule" />
      <Stripboard key={days.map((d) => d.id).join(",")} projectId={id} scenes={scenes} initialDays={days} />
    </main>
  );
}
