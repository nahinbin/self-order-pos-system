"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Loader from "@/components/Loader";

type CategoryItem = { id: number; name: string; sort_order?: number };
type MenuItem = {
  id: number;
  name: string;
  category: string;
  sort_order: number;
  price: number;
};

export default function OrganizeMenuPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, menuRes] = await Promise.all([
        fetch("/api/admin/dictionary?type=category"),
        fetch("/api/admin/menu"),
      ]);
      const catData = await catRes.json().catch(() => []);
      const menuData = await menuRes.json().catch(() => []);
      setCategories(Array.isArray(catData) ? catData : []);
      setMenuItems(Array.isArray(menuData) ? menuData : []);
    } catch {
      setError("Failed to load data");
      setCategories([]);
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const itemsByCategory = categories.reduce((acc, cat) => {
    acc[cat.name] = menuItems
      .filter((m) => m.category === cat.name)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return acc;
  }, {} as Record<string, MenuItem[]>);

  // Categories drag and drop
  const [draggedCatId, setDraggedCatId] = useState<number | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<number | null>(null);

  const handleCategoryDragStart = (e: React.DragEvent, id: number) => {
    setDraggedCatId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `cat-${id}`);
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "category", id }));
  };
  const handleCategoryDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (e.dataTransfer.types.includes("application/json")) setDragOverCatId(id);
  };
  const handleCategoryDragLeave = () => setDragOverCatId(null);
  const handleCategoryDragEnd = () => {
    setDraggedCatId(null);
    setDragOverCatId(null);
  };
  const handleCategoryDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    setDragOverCatId(null);
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let data: { type: string; id: number };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type !== "category" || data.id === targetId) return;
    const fromIndex = categories.findIndex((c) => c.id === data.id);
    const toIndex = categories.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...categories];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    setCategories(next);
    setSaving("categories");
    try {
      const res = await fetch("/api/admin/dictionary/category-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((c) => c.id) }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      setError("Failed to save category order");
      fetchData();
    } finally {
      setSaving(null);
    }
  };

  // Product drag and drop (within category)
  const [draggedProductId, setDraggedProductId] = useState<number | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<number | null>(null);
  const [dragProductCategory, setDragProductCategory] = useState<string | null>(null);

  const handleProductDragStart = (e: React.DragEvent, item: MenuItem) => {
    setDraggedProductId(item.id);
    setDragProductCategory(item.category);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "product", id: item.id, category: item.category }));
  };
  const handleProductDragOver = (e: React.DragEvent, item: MenuItem) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragProductCategory === item.category && e.dataTransfer.types.includes("application/json"))
      setDragOverProductId(item.id);
  };
  const handleProductDragLeave = () => setDragOverProductId(null);
  const handleProductDragEnd = () => {
    setDraggedProductId(null);
    setDragOverProductId(null);
    setDragProductCategory(null);
  };
  const handleProductDrop = async (e: React.DragEvent, category: string, targetItem: MenuItem) => {
    e.preventDefault();
    setDragOverProductId(null);
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let data: { type: string; id: number; category: string };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type !== "product" || data.category !== category || data.id === targetItem.id) return;
    const list = itemsByCategory[category] ?? [];
    const fromIndex = list.findIndex((i) => i.id === data.id);
    const toIndex = list.findIndex((i) => i.id === targetItem.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...list];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    const newOrder = next.map((i) => i.id);
    setSaving(`products-${category}`);
    try {
      const res = await fetch("/api/admin/menu/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, itemIds: newOrder }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await fetchData();
    } catch {
      setError("Failed to save product order");
      fetchData();
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-4">
          <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">← Menu</Link>
          <Link href="/admin" className="text-stone-500 hover:text-stone-700">Dashboard</Link>
        </div>
        <Loader className="py-12" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">← Menu</Link>
        <Link href="/admin" className="text-stone-500 hover:text-stone-700">Dashboard</Link>
      </div>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">Category & product order</h1>
      <p className="text-sm text-stone-500 mb-6">
        Drag categories to change their order on the order page. Drag products within a category to change their order. Add categories in the Dictionary first.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>
      )}
      {saving && (
        <div className="mb-4 p-2 rounded-lg bg-amber-50 text-amber-800 text-sm">Saving…</div>
      )}

      {categories.length === 0 ? (
        <div className="p-6 rounded-xl border border-stone-200 bg-stone-50 text-stone-600">
          No categories in the dictionary yet. <Link href="/admin/dictionary" className="text-amber-600 underline font-medium">Add categories in Dictionary</Link> (e.g. Mains, Drinks), then they will appear here for reordering.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Category order */}
          <section>
            <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider mb-3">Category order</h2>
            <p className="text-xs text-stone-500 mb-2">Drag to change the order customers see (e.g. Mains before Drinks).</p>
            <ul className="space-y-1 max-w-md">
              {categories.map((cat) => (
                <li
                  key={cat.id}
                  draggable
                  onDragStart={(e) => handleCategoryDragStart(e, cat.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
                  onDragLeave={handleCategoryDragLeave}
                  onDragEnd={handleCategoryDragEnd}
                  onDrop={(e) => handleCategoryDrop(e, cat.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 bg-white transition ${
                    draggedCatId === cat.id
                      ? "opacity-50 border-amber-400"
                      : dragOverCatId === cat.id
                        ? "border-amber-500 bg-amber-50"
                        : "border-stone-200 hover:border-stone-300 cursor-grab active:cursor-grabbing"
                  }`}
                >
                  <span className="text-stone-400 select-none" aria-hidden>⋮⋮</span>
                  <span className="font-medium text-stone-800">{cat.name}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Products per category */}
          <section>
            <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider mb-3">Product order within each category</h2>
            <p className="text-xs text-stone-500 mb-4">Drag products to change their order under that category.</p>
            <div className="space-y-6">
              {categories.map((cat) => {
                const items = itemsByCategory[cat.name] ?? [];
                return (
                  <div key={cat.id} className="rounded-xl border border-stone-200 bg-stone-50/50 overflow-hidden">
                    <div className="px-4 py-2 bg-stone-100 border-b border-stone-200 font-medium text-stone-800">
                      {cat.name}
                      <span className="ml-2 text-stone-500 font-normal text-sm">{items.length} product{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <ul className="p-2 space-y-1 min-h-[44px]">
                      {items.length === 0 ? (
                        <li className="px-4 py-3 text-stone-500 text-sm">No products in this category</li>
                      ) : (
                        items.map((item) => (
                          <li
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleProductDragStart(e, item)}
                            onDragOver={(e) => handleProductDragOver(e, item)}
                            onDragLeave={handleProductDragLeave}
                            onDragEnd={handleProductDragEnd}
                            onDrop={(e) => handleProductDrop(e, cat.name, item)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 bg-white transition ${
                              draggedProductId === item.id
                                ? "opacity-50 border-amber-400"
                                : dragOverProductId === item.id
                                  ? "border-amber-500 bg-amber-50"
                                  : "border-transparent hover:border-stone-200 hover:bg-white cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            <span className="text-stone-400 select-none text-sm" aria-hidden>⋮⋮</span>
                            <span className="flex-1 font-medium text-stone-800">{item.name}</span>
                            <span className="text-amber-700 font-medium">${Number(item.price).toFixed(2)}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
