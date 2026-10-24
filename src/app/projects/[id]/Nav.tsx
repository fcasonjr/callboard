import Link from "next/link";

export function Nav({ id, active }: { id: string; active: "scenes" | "schedule" }) {
  return (
    <nav className="nav">
      <Link href={`/projects/${id}`} className={active === "scenes" ? "on" : ""}>Scenes</Link>
      <Link href={`/projects/${id}/schedule`} className={active === "schedule" ? "on" : ""}>Stripboard</Link>
    </nav>
  );
}
