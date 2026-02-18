"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Loader from "@/components/Loader";

type DictItem = { id: number; name: string };

export default function FoodDictionaryPage() {
  const [list, setList] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
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
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setNewName("");
        fetchList();
      }
    } finally {
      setAdding(false);
    }
  };

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
        Add food names here (no prices). When adding products or options, you can choose from this list or add new names on the fly.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Burger, Beef patty, Buns, Chili sauce"
          className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
        />
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
        <p className="text-stone-500">No entries yet. Add names above or when creating a product.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((item) => (
            <li
              key={item.id}
              className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-800 text-sm"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
