"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type AdminBranding = {
  displayName: string;
  logoUrl: string | null;
};

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/cashier", label: "Cashier" },
  { href: "/admin/orders", label: "Kitchen" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/qr", label: "Tables & QR" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
   const [branding, setBranding] = useState<AdminBranding | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        setBranding({
          displayName: data.displayName || data.name || "Restaurant",
          logoUrl: data.logoUrl ?? null,
        });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <Link
            href="/admin"
            className="flex items-center gap-2 shrink-0 min-w-0"
          >
            {branding?.logoUrl ? (
              <span className="inline-flex h-7 w-7 rounded-lg overflow-hidden bg-stone-100 border border-stone-200">
                <img
                  src={branding.logoUrl}
                  alt={branding.displayName}
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white text-xs font-bold">
                {(branding?.displayName || "Restaurant")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            )}
            <span className="text-lg font-bold text-stone-900 tracking-tight truncate">
              {branding?.displayName || "Restaurant"}
            </span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  isActive(item.href)
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
