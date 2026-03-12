"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Loader from "@/components/Loader";

type DictItem = { id: number; name: string; type: string };

export default function FoodDictionaryPage() {
  const [list, setList] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [addAsType, setAddAsType] = useState<"item" | "category">("item");
  const [adding, setAdding] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dictionary");
      const data = await res.json().catch(() => []);
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, type: addAsType }),
      });
      if (res.ok) {
        setNewName("");
        fetchList();
      }
    } finally {
      setAdding(false);
    }
  };

  const categories = list.filter((i) => i.type === "category");
  const items = list.filter((i) => i.type === "item");

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">
          ← Menu
        </Link>
        <Link href="/admin" className="text-stone-500 hover:text-stone-700">
          Dashboard
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">Food dictionary</h1>
      <p className="text-sm text-stone-500 mb-4">
        Add <strong>food names</strong> (for products and options) and <strong>categories</strong> (e.g. Mains, Drinks). Categories are used to group products on the order page. When creating a product, you must pick a category from this list.
      </p>

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Burger, Mains, Drinks"
          className="flex-1 min-w-[140px] max-w-xs px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
        />
        <select
          value={addAsType}
          onChange={(e) => setAddAsType(e.target.value as "item" | "category")}
          className="px-3 py-2 rounded-lg border border-stone-300 text-stone-800 bg-white"
        >
          <option value="item">Food / product name</option>
          <option value="category">Category</option>
        </select>
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add to dictionary"}
        </button>
      </form>

      {loading ? (
        <Loader />
      ) : list.length === 0 ? (
        <p className="text-stone-500">No entries yet. Add food names and categories above. Add at least one <strong>Category</strong> (e.g. Mains, Drinks) before creating products.</p>
      ) : (
        <div className="space-y-4">
          {categories.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-stone-600 mb-2">Categories (for grouping products)</h2>
              <ul className="flex flex-wrap gap-2">
                {categories.map((item) => (
                  <li
                    key={item.id}
                    className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 text-sm font-medium"
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {items.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-stone-600 mb-2">Food / product names</h2>
              <ul className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-800 text-sm"
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
