import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const linkError = searchParams.get("error_description") ?? searchParams.get("error");
  let reason = linkError ?? "The sign-in link had no code. Request a new link.";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    reason = error.message;
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
}
