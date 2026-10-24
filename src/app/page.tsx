import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createProject(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const id = crypto.randomUUID();
  const { error } = await supabase.from("project").insert({ id, title, owner_id: auth.user.id });
  if (error) redirect(`/?error=${encodeURIComponent(`${error.message} (${error.code ?? "no code"})`)}`);
  redirect(`/projects/${id}`);
}

async function signOut() {
  "use server";
  await (await createClient()).auth.signOut();
  redirect("/login");
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("project")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}>
      <h1>Callboard</h1>
      {error && <p style={{ color: "#b00020", background: "#fdecea", padding: 10 }}>Could not create project: {error}</p>}
      <h2>Projects</h2>
      {projects?.length ? (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>{p.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No projects yet.</p>
      )}
      <form action={createProject} style={{ margin: "24px 0" }}>
        <input name="title" placeholder="New project title" required style={{ padding: 8, marginRight: 8 }} />
        <button type="submit" style={{ padding: "8px 16px" }}>Create project</button>
      </form>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
