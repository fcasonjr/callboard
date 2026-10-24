"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
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
        <p>Check your email for a sign-in link. You can close this tab.</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, margin: "6px 0 12px", boxSizing: "border-box" }}
            />
          </label>
          <button type="submit" disabled={state === "sending"} style={{ padding: "8px 16px" }}>
            {state === "sending" ? "Sending..." : "Email me a sign-in link"}
          </button>
          {state === "error" && <p style={{ color: "#b00020" }}>{message}</p>}
        </form>
      )}
    </main>
  );
}
