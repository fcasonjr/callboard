import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Callboard",
  description: "Script to call sheet for small productions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
