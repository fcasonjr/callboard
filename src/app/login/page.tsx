"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const input = { display: "block", width: "100%", padding: 8, margin: "6px 0 12px", boxSizing: "border-box" as const };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) {
      setState("error");
      setMessage(err);
    }
  }, []);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      window.location.href = "/";
    }
  }

  async function sendLink() {
    if (!email) {
      setState("error");
      setMessage("Enter your email first.");
      return;
    }
    setState("busy");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <main style={{ maxWidth: 380, margin: "80px auto", padding: "0 16px" }}>
      <h1>Callboard</h1>
      {state === "sent" ? (
        <p>Check your email for a sign-in link, and open it in this same browser.</p>
      ) : (
        <form onSubmit={signInWithPassword}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
          </label>
          <button type="submit" disabled={state === "busy" || !password} style={{ padding: "8px 16px" }}>
            Sign in
          </button>
          <button type="button" onClick={sendLink} disabled={state === "busy"} style={{ padding: "8px 16px", marginLeft: 8 }}>
            Email me a link instead
          </button>
          {state === "error" && <p style={{ color: "#b00020" }}>{message}</p>}
        </form>
      )}
    </main>
  );
}
