"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function OfflineBanner({ savedAt, version }: { savedAt: string; version: number }) {
  const online = useOnline();
  return (
    <>
      <Script src="/cb-offline.js" strategy="afterInteractive" />
      {!online && (
        <div role="status" className="cs-offline">
          You're offline. Showing version {version}, saved {new Date(savedAt).toLocaleString()}. Reconnect to check for changes.
        </div>
      )}
    </>
  );
}

export function ConfirmForm({ action, name }: { action: () => Promise<void>; name: string }) {
  const online = useOnline();
  return (
    <form action={action}>
      <button type="submit" disabled={!online} className="cs-confirm">
        {online ? `Confirm my call, ${name}` : "Reconnect to confirm"}
      </button>
    </form>
  );
}
