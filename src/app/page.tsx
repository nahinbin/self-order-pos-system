"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  price: number;
  category: string;
};

type PublicSettings = {
  displayName: string;
  logoUrl: string | null;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function HomePage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [branding, setBranding] = useState<PublicSettings | null>(null);

  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const res = await fetch("/api/menu");
      if (res.ok) {
        const data = await res.json();
        setMenu(Array.isArray(data) ? data : []);
      }
    } catch {
      /* ignore */
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
    fetch("/api/shift/status")
      .then((r) => r.json())
      .then((d) => setIsOpen(d.open !== false))
      .catch(() => setIsOpen(null));
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setBranding({
          displayName: data.displayName || data.name || "Our restaurant",
          logoUrl: data.logoUrl ?? null,
        });
      })
      .catch(() => {
        /* ignore */
      });
  }, [fetchMenu]);

  const categories = useMemo(
    () => [...new Set(menu.map((m) => m.category).filter(Boolean))],
    [menu]
  );

  const featured = useMemo(() => {
    const withImages = menu.filter((m) => m.image_url);
    if (withImages.length >= 3) return withImages.slice(0, 6);
    return menu.slice(0, 6);
  }, [menu]);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Hero */}
      <section className="relative bg-stone-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900/40" />
        <div className="relative max-w-3xl mx-auto px-5 pt-16 pb-20 text-center">
          {isOpen !== null && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-6">
              <span
                className={`w-2 h-2 rounded-full ${isOpen ? "bg-emerald-400" : "bg-red-400"}`}
              />
              <span className="text-xs font-semibold tracking-wide">
                {isOpen ? "Open now" : "Currently closed"}
              </span>
            </div>
          )}
          {(branding?.logoUrl || branding?.displayName) && (
            <div className="flex flex-col items-center gap-2 mb-2">
              {branding.logoUrl && (
                <img
                  src={branding.logoUrl}
                  alt={branding.displayName || "Restaurant"}
                  className="h-12 w-auto max-w-[180px] object-contain"
                />
              )}
              {branding.displayName && (
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
                  {branding.displayName}
                </p>
              )}
            </div>
          )}
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-3">
            Our Menu
          </h1>
          <p className="text-lg text-white/70 mb-8 max-w-md mx-auto">
            Fresh food, made to order. Scan the QR at your table or tap below to start.
          </p>
          <Link
            href="/order"
            className="inline-block px-8 py-4 rounded-2xl bg-amber-500 text-stone-900 font-bold text-lg hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
          >
            Order now
          </Link>
        </div>
        {/* Decorative bottom curve */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full h-auto">
            <path d="M0 60h1440V30C1200 0 960 50 720 30S240 0 0 30z" fill="#fafaf9" />
          </svg>
        </div>
      </section>

      {/* Categories pills */}
      {categories.length > 0 && (
        <section className="max-w-3xl mx-auto px-5 pt-8 pb-2">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat}
                className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-sm font-semibold text-stone-700"
              >
                {cat}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Featured items */}
      <section className="max-w-3xl mx-auto px-5 pt-6 pb-4">
        {menuLoading ? (
          <div className="py-16 flex justify-center">
            <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          </div>
        ) : featured.length === 0 ? (
          <p className="text-center text-stone-400 py-12">
            Menu items will appear here once the restaurant sets up the menu.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {featured.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white overflow-hidden hover:shadow-md transition group"
              >
                {item.image_url ? (
                  <div className="aspect-[16/9] bg-stone-100 overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center">
                    <span className="text-4xl text-stone-200">🍽</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 text-base">{item.name}</p>
                      {item.description && (
                        <p className="text-sm text-stone-500 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="text-amber-700 font-bold text-base whitespace-nowrap">
                      {money(item.price)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Browse full menu CTA */}
      {menu.length > 6 && (
        <section className="max-w-3xl mx-auto px-5 pb-6 text-center">
          <Link
            href="/order"
            className="inline-block px-6 py-3 rounded-xl border-2 border-stone-200 text-stone-700 font-semibold hover:border-stone-300 hover:bg-white transition"
          >
            View full menu ({menu.length} items)
          </Link>
        </section>
      )}

      {/* Info section */}
      <section className="max-w-3xl mx-auto px-5 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white border border-stone-200 p-5 text-center">
            <div className="text-2xl mb-2">📱</div>
            <p className="font-bold text-stone-900 text-sm">Scan & Order</p>
            <p className="text-xs text-stone-500 mt-1">Scan the QR code at your table to start</p>
          </div>
          <div className="rounded-2xl bg-white border border-stone-200 p-5 text-center">
            <div className="text-2xl mb-2">🍳</div>
            <p className="font-bold text-stone-900 text-sm">Made Fresh</p>
            <p className="text-xs text-stone-500 mt-1">Every order is prepared when you place it</p>
          </div>
          <div className="rounded-2xl bg-white border border-stone-200 p-5 text-center">
            <div className="text-2xl mb-2">💳</div>
            <p className="font-bold text-stone-900 text-sm">Pay Your Way</p>
            <p className="text-xs text-stone-500 mt-1">Card or cash — choose at checkout</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-5 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {branding?.logoUrl && (
              <img
                src={branding.logoUrl}
                alt=""
                className="h-6 w-auto max-w-[100px] object-contain shrink-0"
              />
            )}
            <p className="text-xs text-stone-400 truncate">
              {branding?.displayName || "Restaurant"}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs text-stone-400 hover:text-stone-600 transition shrink-0"
          >
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
