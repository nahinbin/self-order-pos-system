"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DictionaryPicker } from "@/components/DictionaryPicker";
import Loader from "@/components/Loader";

type CategoryOption = { id: number; name: string };

type ItemOption = { id: number; name: string; price_modifier: number; is_default: number; sort_order: number };
type OptionGroup = {
  id: number;
  menu_item_id: number;
  name: string;
  required: number;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  options?: ItemOption[];
};
type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  price: number;
  cost?: number | null;
  category: string;
  available: number;
  sort_order: number;
  option_groups?: OptionGroup[];
};

export default function EditMenuItemPage() {
  const params = useParams();
  const id = params?.id as string;
  const [item, setItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [available, setAvailable] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [newGroupMin, setNewGroupMin] = useState(1);
  const [newGroupMax, setNewGroupMax] = useState(1);
  const [addingGroup, setAddingGroup] = useState(false);

  const [newOptionGroupId, setNewOptionGroupId] = useState<number | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("0");
  const [newOptionDefault, setNewOptionDefault] = useState(false);

  const [dictPickerOpen, setDictPickerOpen] = useState(false);
  /** "product" | "new_option" | { optionId: number } for editing existing option */
  const [dictPickerTarget, setDictPickerTarget] = useState<"product" | "new_option" | { optionId: number } | null>(null);

  const fetchItem = useCallback(() => {
    if (!id) return;
    fetch(`/api/admin/menu/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setItem(data);
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setImageUrl(data.image_url ?? null);
        setPrice(String(data.price ?? ""));
        setCost(data.cost != null ? String(data.cost) : "");
        setCategory(data.category ?? "");
        setAvailable(data.available ?? 1);
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch("/api/admin/dictionary?type=category");
      const data = await res.json().catch(() => []);
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = parseFloat(price);
    const c = cost.trim() ? parseFloat(cost) : 0;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (isNaN(p) || p < 0) {
      setError("Enter a valid price");
      return;
    }
    if (cost.trim() && (isNaN(c) || c < 0)) {
      setError("Enter a valid cost/expenditure");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
          price: p,
          cost: cost.trim() ? c : null,
          category: category.trim(),
          available: available ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      fetchItem();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const openDictionary = (target: "product" | "new_option" | { optionId: number }) => {
    setDictPickerTarget(target);
    setDictPickerOpen(true);
  };

  const onDictionarySelect = (selectedName: string) => {
    if (dictPickerTarget === "product") setName(selectedName);
    else if (dictPickerTarget === "new_option") setNewOptionName(selectedName);
    else if (dictPickerTarget && typeof dictPickerTarget === "object")
      updateOption(dictPickerTarget.optionId, "name", selectedName);
    setDictPickerTarget(null);
  };

  const addOptionGroup = async () => {
    if (!newGroupName.trim() || !id) return;
    setAddingGroup(true);
    try {
      const res = await fetch(`/api/admin/menu/${id}/option-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          required: newGroupRequired ? 1 : 0,
          min_selections: newGroupMin,
          max_selections: newGroupMax,
        }),
      });
      if (res.ok) {
        setNewGroupName("");
        setNewGroupRequired(true);
        setNewGroupMin(1);
        setNewGroupMax(1);
        fetchItem();
      }
    } finally {
      setAddingGroup(false);
    }
  };

  const deleteOptionGroup = async (groupId: number) => {
    if (!confirm("Delete this option group and all its choices?")) return;
    const res = await fetch(`/api/admin/option-groups/${groupId}`, { method: "DELETE" });
    if (res.ok) fetchItem();
  };

  const updateGroupSingleMulti = async (groupId: number, chooseOne: boolean) => {
    const res = await fetch(`/api/admin/option-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        min_selections: chooseOne ? 1 : 0,
        max_selections: chooseOne ? 1 : 10,
      }),
    });
    if (res.ok) fetchItem();
  };

  const addOption = async (groupId: number) => {
    if (!newOptionName.trim()) return;
    const res = await fetch(`/api/admin/option-groups/${groupId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newOptionName.trim(),
        price_modifier: parseFloat(newOptionPrice) || 0,
        is_default: newOptionDefault ? 1 : 0,
      }),
    });
    if (res.ok) {
      setNewOptionGroupId(null);
      setNewOptionName("");
      setNewOptionPrice("0");
      setNewOptionDefault(false);
      fetchItem();
    }
  };

  const deleteOption = async (optionId: number) => {
    if (!confirm("Remove this choice?")) return;
    const res = await fetch(`/api/admin/item-options/${optionId}`, { method: "DELETE" });
    if (res.ok) fetchItem();
  };

  const updateOption = async (optionId: number, field: "name" | "price_modifier" | "is_default", value: string | number) => {
    const body: { name?: string; price_modifier?: number; is_default?: number } = {};
    if (field === "name") body.name = String(value);
    if (field === "price_modifier") body.price_modifier = Number(value);
    if (field === "is_default") body.is_default = value ? 1 : 0;
    await fetch(`/api/admin/item-options/${optionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchItem();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="py-8">
        <p className="text-stone-500 mb-4">Item not found.</p>
        <Link href="/admin/menu" className="text-amber-700 underline">Back to Menu</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">← Menu</Link>
      </div>
      <h1 className="text-xl font-semibold text-stone-800 mb-4">Edit: {item.name}</h1>

      <form onSubmit={saveItem} className="space-y-4 mb-8">
        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-stone-700">Photo</span>
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-28 h-28 rounded-xl object-cover border border-stone-200" />
            ) : (
              <div className="w-28 h-28 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 text-xs border border-dashed border-stone-300">No photo</div>
            )}
            <label className="cursor-pointer py-2 px-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100">
              {uploading ? "Uploading…" : imageUrl ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const fd = new FormData();
                    fd.set("file", file);
                    const r = await fetch("/api/upload", { method: "POST", body: fd });
                    const data = await r.json();
                    if (data.url) setImageUrl(data.url);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex gap-2 items-center flex-wrap">
              <input type="text" value={name} readOnly className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 text-stone-800" />
              <button type="button" onClick={() => openDictionary("product")} className="shrink-0 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700">{name ? "Change" : "Pick name"}</button>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-stone-500 mb-0.5">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-0.5">Cost / expenditure</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-0.5">Category (from dictionary)</label>
                {categoriesLoading ? (
                  <span className="text-stone-400 text-sm">Loading…</span>
                ) : categories.length === 0 ? (
                  <span className="text-amber-700 text-sm"><Link href="/admin/dictionary" className="underline">Add categories in Dictionary</Link></span>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-stone-300 text-stone-800 min-w-[120px] bg-white"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <label className="flex items-center gap-2 pt-6 cursor-pointer">
                <input type="checkbox" checked={available === 1} onChange={(e) => setAvailable(e.target.checked ? 1 : 0)} />
                <span className="text-sm text-stone-600">Show on menu</span>
              </label>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800" placeholder="Optional" />
            </div>
            <button type="submit" disabled={saving} className="py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </form>

      <section>
        <h2 className="text-lg font-semibold text-stone-800 mb-3">Option categories</h2>

        {item.option_groups?.map((group) => {
          const isSingle = group.max_selections === 1;
          return (
            <div
              key={group.id}
              className="bg-white rounded-xl border border-stone-200 p-4 mb-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="font-medium text-stone-800">{group.name}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-stone-600">
                    <input
                      type="radio"
                      name={`group-mode-${group.id}`}
                      checked={isSingle}
                      onChange={() => updateGroupSingleMulti(group.id, true)}
                    />
                    Choose one
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-stone-600">
                    <input
                      type="radio"
                      name={`group-mode-${group.id}`}
                      checked={!isSingle}
                      onChange={() => updateGroupSingleMulti(group.id, false)}
                    />
                    Choose multiple
                  </label>
                </div>
                <span className="text-xs text-stone-500">{group.required ? "Required" : "Optional"}</span>
                <button
                  type="button"
                  onClick={() => deleteOptionGroup(group.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Delete category
                </button>
              </div>
              <p className="text-xs text-stone-400 mb-2">Options</p>
              <ul className="space-y-2 mb-3">
                {group.options?.map((opt) => (
                  <li key={opt.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="text"
                      value={opt.name}
                      readOnly
                      className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-stone-200 bg-stone-50"
                      placeholder="From dictionary"
                    />
                    <button
                      type="button"
                      onClick={() => openDictionary({ optionId: opt.id })}
                      className="shrink-0 px-2 py-1.5 rounded border border-amber-500 text-amber-700 text-xs font-medium hover:bg-amber-50"
                    >
                      Change
                    </button>
                    <span className="text-stone-500 text-sm">+$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={opt.price_modifier}
                      onBlur={(e) => updateOption(opt.id, "price_modifier", e.target.value)}
                      className="w-20 px-2 py-2 rounded-lg border border-stone-200"
                      placeholder="0"
                    />
                    <label className="flex items-center gap-1 text-xs text-stone-500">
                      <input
                        type="checkbox"
                        defaultChecked={opt.is_default === 1}
                        onChange={(e) => updateOption(opt.id, "is_default", e.target.checked ? 1 : 0)}
                      />
                      Default
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteOption(opt.id)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {newOptionGroupId === group.id ? (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100">
                  <input
                    type="text"
                    value={newOptionName}
                    readOnly
                    placeholder="Choose from dictionary"
                    className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-stone-300 text-sm bg-stone-50"
                  />
                  <button
                    type="button"
                    onClick={() => openDictionary("new_option")}
                    className="shrink-0 px-2 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                  >
                    {newOptionName ? "Change" : "Choose from dictionary"}
                  </button>
                  <span className="text-stone-500 text-sm">+$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newOptionPrice}
                    onChange={(e) => setNewOptionPrice(e.target.value)}
                    placeholder="0"
                    className="w-20 px-2 py-2 rounded-lg border border-stone-300 text-sm"
                  />
                  <label className="flex items-center gap-1 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      checked={newOptionDefault}
                      onChange={(e) => setNewOptionDefault(e.target.checked)}
                    />
                    Default
                  </label>
                  <button
                    type="button"
                    onClick={() => addOption(group.id)}
                    disabled={!newOptionName.trim()}
                    className="py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                  >
                    Add option
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOptionGroupId(null)}
                    className="text-stone-500 text-sm hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewOptionGroupId(group.id)}
                  className="text-sm text-amber-700 font-medium hover:underline"
                >
                  + Add option to this category
                </button>
              )}
            </div>
          );
        })}

        <div className="bg-stone-50 rounded-xl border border-dashed border-stone-200 p-4">
          <p className="text-sm font-medium text-stone-700 mb-3">Add category</p>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Category name (e.g. Type of patty)"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="selectionMode" checked={newGroupMax === 1} onChange={() => { setNewGroupMin(1); setNewGroupMax(1); }} />
                One option
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="selectionMode" checked={newGroupMax > 1} onChange={() => { setNewGroupMin(0); setNewGroupMax(10); }} />
                Multiple
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} />
                Required
              </label>
            </div>
            <button
              type="button"
              onClick={addOptionGroup}
              disabled={addingGroup || !newGroupName.trim()}
              className="py-2 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 w-fit"
            >
              {addingGroup ? "Adding…" : "Add category"}
            </button>
          </div>
        </div>
      </section>

      <DictionaryPicker
        open={dictPickerOpen}
        onClose={() => { setDictPickerOpen(false); setDictPickerTarget(null); }}
        onSelect={onDictionarySelect}
        title="Food dictionary"
        placeholder="Search or add (e.g. burger, beef patty, buns)..."
        filterType="item"
      />
    </div>
  );
}
