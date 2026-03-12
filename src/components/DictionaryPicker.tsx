"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type DictionaryItem = { id: number; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** When selecting from list or after add: name and optional dictionary item id. */
  onSelect: (name: string, dictionaryItemId?: number) => void;
  title?: string;
  placeholder?: string;
  /** Only show and add entries of this type. Omit for all (e.g. dictionary page). */
  filterType?: "item" | "category";
};

const DEBOUNCE_MS = 200;

export function DictionaryPicker({ open, onClose, onSelect, title = "Food dictionary", placeholder = "Search or add...", filterType }: Props) {
  const [search, setSearch] = useState("");
  const [list, setList] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filterType) params.set("type", filterType);
      const url = `/api/admin/dictionary${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => []);
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    fetchList("");
    inputRef.current?.focus();
  }, [open, fetchList]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchList(search);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open, fetchList]);

  const handleSelect = (name: string, id?: number) => {
    onSelect(name, id);
    onClose();
  };

  const handleAddAndUse = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, type: filterType ?? "item" }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const data = await res.json();
      handleSelect(data.name ?? trimmed, data.id);
    } catch {
      handleSelect(trimmed);
    } finally {
      setAdding(false);
    }
  };

  const trimmedSearch = search.trim();
  const exactMatch = list.some((i) => i.name.toLowerCase() === trimmedSearch.toLowerCase());

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-stone-200">
          <h3 className="font-semibold text-stone-800">{title}</h3>
          <p className="text-xs text-stone-500 mt-0.5">Select from list or add a new name</p>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="mt-3 w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800 placeholder:text-stone-400"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="py-6 flex justify-center"><div className="h-8 w-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /></div>
          ) : (
            <ul className="space-y-0.5">
              {list.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.name, item.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-50 text-stone-800 font-medium"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && trimmedSearch && !exactMatch && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={handleAddAndUse}
                disabled={adding}
                className="w-full px-3 py-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium disabled:opacity-50"
              >
                {adding ? "Adding…" : `Add "${trimmedSearch}" to dictionary & use`}
              </button>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-stone-300 text-stone-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
