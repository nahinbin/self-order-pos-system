import type { Metadata } from "next";
import "./globals.css";

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/admin/settings`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const title = data.displayName || data.name || "Restaurant";
    return {
      title,
      description: "Scan, order, pay — at your table.",
    };
  } catch {
    return {
      title: "Restaurant",
      description: "Scan, order, pay — at your table.",
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}