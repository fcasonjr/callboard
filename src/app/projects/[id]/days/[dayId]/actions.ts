"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const path = (p: string, d: string) => `/projects/${p}/days/${d}`;

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function createCallSheet(projectId: string, dayId: string) {
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("call_sheet")
    .select("version_no")
    .eq("shoot_day_id", dayId)
    .order("version_no", { ascending: false })
    .limit(1);
  const { error } = await supabase
    .from("call_sheet")
    .insert({ project_id: projectId, shoot_day_id: dayId, version_no: (last?.[0]?.version_no ?? 0) + 1 });
  fail(error);
  revalidatePath(path(projectId, dayId));
}

export async function saveDetails(projectId: string, dayId: string, sheetId: string, formData: FormData) {
  const supabase = await createClient();
  const v = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const weather = v("weather");
  const { error } = await supabase
    .from("call_sheet")
    .update({
      sunrise: v("sunrise"),
      sunset: v("sunset"),
      nearest_hospital: v("nearest_hospital"),
      notes: v("notes"),
      weather: weather ? { summary: weather } : null,
    })
    .eq("id", sheetId);
  fail(error);
  const { error: e2 } = await supabase.from("shoot_day").update({ general_call: v("general_call") }).eq("id", dayId);
  fail(e2);
  revalidatePath(path(projectId, dayId));
}

export async function saveLocation(projectId: string, dayId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const address = String(formData.get("address") ?? "").trim() || null;
  const { data, error } = await supabase
    .from("location")
    .insert({ project_id: projectId, name, address })
    .select("id")
    .single();
  fail(error);
  const { error: e2 } = await supabase.from("shoot_day").update({ location_id: data!.id }).eq("id", dayId);
  fail(e2);
  revalidatePath(path(projectId, dayId));
}

export async function addCrewCall(projectId: string, dayId: string, sheetId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const kind = String(formData.get("kind") ?? "crew");
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const call = String(formData.get("call") ?? "") || null;

  const { data: existing } = await supabase
    .from("person")
    .select("id")
    .eq("project_id", projectId)
    .ilike("name", name)
    .limit(1);
  let personId = existing?.[0]?.id as string | undefined;
  if (!personId) {
    const { data, error } = await supabase
      .from("person")
      .insert({ project_id: projectId, name, kind, phone })
      .select("id")
      .single();
    fail(error);
    personId = data!.id;
  }
  const { error } = await supabase
    .from("call_time")
    .upsert({ project_id: projectId, call_sheet_id: sheetId, person_id: personId, call }, { onConflict: "call_sheet_id,person_id" });
  fail(error);
  revalidatePath(path(projectId, dayId));
}

export async function removeCrewCall(projectId: string, dayId: string, callTimeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("call_time").delete().eq("id", callTimeId);
  fail(error);
  revalidatePath(path(projectId, dayId));
}

export async function markSent(projectId: string, dayId: string, sheetId: string, callTimeId?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("call_time")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("call_sheet_id", sheetId)
    .eq("status", "draft");
  if (callTimeId) q = q.eq("id", callTimeId);
  const { error } = await q;
  fail(error);
  revalidatePath(path(projectId, dayId));
}

export async function publishSheet(projectId: string, dayId: string, sheetId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("call_sheet")
    .update({ published_at: new Date().toISOString() })
    .eq("id", sheetId)
    .is("published_at", null);
  fail(error);
  revalidatePath(path(projectId, dayId));
}

export async function reissueSheet(projectId: string, dayId: string, sheetId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reissue_call_sheet", { p_sheet: sheetId });
  fail(error);
  revalidatePath(path(projectId, dayId));
}
