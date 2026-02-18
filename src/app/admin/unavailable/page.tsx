"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DictionaryPicker } from "@/components/DictionaryPicker";
import Loader from "@/components/Loader";

type UnavailableItem = { id: number; name: string; food_dictionary_item_id: number };

export default function UnavailablePage() {
  const [list, setList] = useState<UnavailableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/unavailable");
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

  const handleAddFromDictionary = async (name: string, dictionaryItemId?: number) => {
    let id = dictionaryItemId;
    if (id == null) {
      const res = await fetch(`/api/admin/dictionary?q=${encodeURIComponent(name)}`);
      const dictList = await res.json().catch(() => []);
      const match = Array.isArray(dictList) ? dictList.find((d: { name: string }) => d.name === name) : null;
      id = match?.id;
    }
    if (id == null) return;
    const res = await fetch("/api/admin/unavailable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_dictionary_item_id: id }),
    });
    if (res.ok) fetchList();
  };

  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    try {
      const res = await fetch(`/api/admin/unavailable/${entryId}`, { method: "DELETE" });
      if (res.ok) fetchList();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin" className="text-stone-500 hover:text-stone-700">
          ← Dashboard
        </Link>
        <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">
          Menu
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">Unavailable items</h1>
      <p className="text-sm text-stone-500 mb-4">
        Items in this list are shown as &quot;Unavailable&quot; and faded for customers. Add from the food dictionary; remove when back in stock.
      </p>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mb-6 py-2 px-4 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700"
      >
        Add item to unavailable list
      </button>

      {loading ? (
        <Loader />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-8 text-center">
          <p className="text-stone-600 mb-1">No unavailable items</p>
          <p className="text-sm text-stone-500">Add items from the dictionary when they&apos;re out of stock. Customers will see them greyed out with an &quot;Unavailable&quot; label.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <span className="font-medium text-stone-800">{item.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                disabled={removingId === item.id}
                className="shrink-0 py-1.5 px-3 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
              >
                {removingId === item.id ? "Removing…" : "Mark available"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <DictionaryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddFromDictionary}
        title="Select item to mark unavailable"
        placeholder="Search dictionary..."
      />
    </div>
  );
}
