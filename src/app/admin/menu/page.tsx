"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Loader from "@/components/Loader";

type ItemOption = { id: number; name: string; price_modifier: number; is_default: number };
type OptionGroup = { id: number; name: string; required: number; min_selections: number; max_selections: number; options?: ItemOption[] };
type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  price: number;
  category: string;
  available: number;
  sort_order: number;
  option_groups?: OptionGroup[];
  unavailable?: boolean;
};

const CATEGORIES = ["Mains", "Starters", "Sides", "Salads", "Drinks", "Add-ons"];

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const LOAD_TIMEOUT_MS = 10000;

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError("Load timed out. You can still add items below.");
    }, LOAD_TIMEOUT_MS);
    try {
      const res = await fetch("/api/admin/menu");
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setItems(data);
      } else {
        setItems([]);
        if (!res.ok) setError(data?.error || "Could not load menu. You can still add items below.");
      }
    } catch {
      setItems([]);
      setError("Could not load menu. You can still add items below.");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const deleteItem = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await fetch(`/api/admin/menu/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchMenu();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete item.");
    }
  };

  const patchItem = async (id: number, field: "price" | "category", value: number | string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const res = await fetch(`/api/admin/menu/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        description: item.description,
        price: field === "price" ? value : item.price,
        category: field === "category" ? String(value).trim() : item.category,
        available: item.available,
      }),
    });
    if (res.ok) fetchMenu();
  };

  const byCategory = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const orderedCats = [...CATEGORIES, ...Object.keys(byCategory).filter((c) => !CATEGORIES.includes(c))];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-stone-800">Menu</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/unavailable" className="py-2 px-3 rounded-lg border border-stone-300 text-stone-600 text-sm hover:bg-stone-50">Unavailable</Link>
          <Link href="/admin/dictionary" className="py-2 px-3 rounded-lg border border-stone-300 text-stone-600 text-sm hover:bg-stone-50">Dictionary</Link>
          <Link href="/admin/menu/new" className="py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700">Add item</Link>
        </div>
      </div>

      {loading ? (
        <Loader className="py-12" />
      ) : (
        <>
          {error && (
            <p className="mb-4 py-2 px-3 rounded-lg bg-amber-50 text-amber-800 text-sm">{error}</p>
          )}
          {items.length === 0 ? (
            <p className="text-stone-500 py-8">No items yet. Click &quot;Add food item&quot; to start.</p>
          ) : (
        <div className="space-y-8">
          {orderedCats.map((cat) => {
            const list = byCategory[cat];
            if (!list?.length) return null;
            return (
              <section key={cat}>
                <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">{cat}</h2>
                <ul className="space-y-2">
                  {list.map((item) => {
                    const isUnavailable = item.unavailable === true || item.available === 0;
                    return (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 flex items-center gap-3 ${
                        isUnavailable ? "bg-stone-50 border-stone-200 opacity-75" : "bg-white border-stone-200"
                      }`}
                    >
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 bg-stone-100" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-stone-100 shrink-0 flex items-center justify-center text-stone-400 text-xs">No img</div>
                      )}
                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium text-stone-800">{item.name}</span>
                        {item.available === 0 && <span className="text-xs text-amber-700">(hidden)</span>}
                        {item.unavailable && <span className="text-xs bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">Unavailable</span>}
                        <span className="text-stone-400">·</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={item.price}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v) && v >= 0 && v !== item.price) patchItem(item.id, "price", v);
                          }}
                          className="w-16 px-1.5 py-0.5 text-sm border border-stone-200 rounded focus:border-amber-500 focus:outline-none"
                        />
                        <select
                          value={item.category}
                          onChange={(e) => patchItem(item.id, "category", e.target.value)}
                          className="text-sm border border-stone-200 rounded px-1.5 py-0.5 focus:border-amber-500 focus:outline-none"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {!CATEGORIES.includes(item.category) && (
                            <option value={item.category}>{item.category}</option>
                          )}
                        </select>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Link href={`/admin/menu/${item.id}/edit`} className="py-1.5 px-2.5 rounded-lg border border-stone-300 text-stone-600 text-sm hover:bg-stone-50">Edit</Link>
                        <button type="button" onClick={() => deleteItem(item.id, item.name)} className="py-1.5 px-2.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">Del</button>
                      </div>
                    </li>
                  );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
          )}
        </>
      )}
    </div>
  );
}
