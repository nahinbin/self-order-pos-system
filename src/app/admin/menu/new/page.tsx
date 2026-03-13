"use client";

import { useState, useId, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DictionaryPicker } from "@/components/DictionaryPicker";

type CategoryOption = { id: number; name: string };

type DraftOption = {
  tempId: string;
  name: string;
  price_modifier: number;
  is_default: boolean;
};

type DraftOptionGroup = {
  tempId: string;
  name: string;
  required: boolean;
  min_selections: number;
  max_selections: number;
  options: DraftOption[];
};

export default function NewMenuItemPage() {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftGroups, setDraftGroups] = useState<DraftOptionGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [newGroupChooseOne, setNewGroupChooseOne] = useState(true);

  const [newOptionGroupTempId, setNewOptionGroupTempId] = useState<string | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("0");
  const [newOptionDefault, setNewOptionDefault] = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [dictPickerOpen, setDictPickerOpen] = useState(false);
  /** "product" | "new_option" | { groupTempId, optionTempId } for editing existing option */
  const [dictPickerTarget, setDictPickerTarget] = useState<"product" | "new_option" | { groupTempId: string; optionTempId: string } | null>(null);

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
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!categoriesLoading && categories.length > 0 && !category) {
      setCategory(categories[0].name);
    }
  }, [categoriesLoading, categories, category]);

  const openDictionary = (target: "product" | "new_option" | { groupTempId: string; optionTempId: string }) => {
    setDictPickerTarget(target);
    setDictPickerOpen(true);
  };

  const onDictionarySelect = (selectedName: string) => {
    if (dictPickerTarget === "product") setName(selectedName);
    else if (dictPickerTarget === "new_option") setNewOptionName(selectedName);
    else if (dictPickerTarget && typeof dictPickerTarget === "object")
      updateDraftOption(dictPickerTarget.groupTempId, dictPickerTarget.optionTempId, "name", selectedName);
    setDictPickerTarget(null);
  };

  const addDraftGroup = () => {
    if (!newGroupName.trim()) return;
    const tempId = `g-${uid}-${Date.now()}`;
    setDraftGroups((prev) => [
      ...prev,
      {
        tempId,
        name: newGroupName.trim(),
        required: newGroupRequired,
        min_selections: newGroupChooseOne ? 1 : 0,
        max_selections: newGroupChooseOne ? 1 : 10,
        options: [],
      },
    ]);
    setNewGroupName("");
    setNewGroupRequired(true);
    setNewGroupChooseOne(true);
  };

  const removeDraftGroup = (tempId: string) => {
    setDraftGroups((prev) => prev.filter((g) => g.tempId !== tempId));
    if (newOptionGroupTempId === tempId) setNewOptionGroupTempId(null);
  };

  const addDraftOption = (groupTempId: string) => {
    if (!newOptionName.trim()) return;
    const tempId = `o-${uid}-${Date.now()}`;
    const opt: DraftOption = {
      tempId,
      name: newOptionName.trim(),
      price_modifier: parseFloat(newOptionPrice) || 0,
      is_default: newOptionDefault,
    };
    setDraftGroups((prev) =>
      prev.map((g) =>
        g.tempId === groupTempId ? { ...g, options: [...g.options, opt] } : g
      )
    );
    setNewOptionGroupTempId(null);
    setNewOptionName("");
    setNewOptionPrice("0");
    setNewOptionDefault(false);
  };

  const removeDraftOption = (groupTempId: string, optionTempId: string) => {
    setDraftGroups((prev) =>
      prev.map((g) =>
        g.tempId === groupTempId
          ? { ...g, options: g.options.filter((o) => o.tempId !== optionTempId) }
          : g
      )
    );
  };

  const updateDraftOption = (
    groupTempId: string,
    optionTempId: string,
    field: keyof DraftOption,
    value: string | number | boolean
  ) => {
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.tempId !== groupTempId) return g;
        return {
          ...g,
          options: g.options.map((o) =>
            o.tempId === optionTempId ? { ...o, [field]: value } : o
          ),
        };
      })
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = parseFloat(price);
    const c = cost.trim() ? parseFloat(cost) : 0;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!category.trim()) {
      setError("Select a category from the dictionary. Add categories in Dictionary first if needed.");
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
      const res = await fetch("/api/admin/menu", {
        method: "POST",
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");

      const menuItemId = data.id;

      for (const group of draftGroups) {
        const groupRes = await fetch(`/api/admin/menu/${menuItemId}/option-groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: group.name,
            required: group.required ? 1 : 0,
            min_selections: group.min_selections,
            max_selections: group.max_selections,
          }),
        });
        if (!groupRes.ok) continue;
        const groupData = await groupRes.json();
        const groupId = groupData.id;

        for (const opt of group.options) {
          await fetch(`/api/admin/option-groups/${groupId}/options`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: opt.name,
              price_modifier: opt.price_modifier,
              is_default: opt.is_default ? 1 : 0,
            }),
          });
        }
      }

      router.push(`/admin/menu/${menuItemId}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Link href="/admin/menu" className="text-stone-500 hover:text-stone-700">
          ← Menu
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-stone-800 mb-4">Add food item</h1>
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
        )}

        <div className="flex flex-wrap items-start gap-6 p-4 rounded-xl bg-stone-50 border border-stone-200">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-stone-700">Photo (optional)</span>
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-28 h-28 rounded-xl object-cover border border-stone-200" />
            ) : (
              <div className="w-28 h-28 rounded-xl bg-white border border-dashed border-stone-300 flex items-center justify-center text-stone-400 text-xs">No photo</div>
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
          <div className="flex-1 min-w-0" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Name * (from dictionary)</label>
            <p className="text-xs text-stone-500 mb-1.5">Product name must be chosen from the food dictionary so you can mark it unavailable when needed.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                readOnly
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-300 text-stone-800 bg-stone-50"
                placeholder="Choose from dictionary..."
              />
              <button
                type="button"
                onClick={() => openDictionary("product")}
                className="shrink-0 px-3 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700"
              >
                {name ? "Change" : "Choose from dictionary"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Price *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-stone-400">What the customer pays.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Cost / expenditure (optional)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-stone-400">Your cost to make this item. Used to calculate profit.</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
            placeholder="Short description"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Category * (from dictionary)</label>
            <p className="text-xs text-stone-500 mb-1.5">Add categories (e.g. Mains, Drinks) in the Dictionary first, then select one here.</p>
            {categoriesLoading ? (
              <div className="px-3 py-2 text-stone-500 text-sm">Loading categories…</div>
            ) : categories.length === 0 ? (
              <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                No categories yet. <Link href="/admin/dictionary" className="underline font-medium">Add categories in Dictionary</Link> first (e.g. Mains, Drinks).
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-800"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            <span className="text-sm text-stone-700">Available (show to customers)</span>
          </label>
        </div>

        {/* Customization categories */}
        <section className="border border-stone-200 rounded-xl p-4 bg-stone-50/50">
          <h2 className="text-lg font-semibold text-stone-800 mb-1">Customization categories</h2>
          <p className="text-sm text-stone-500 mb-4">
            Category names are custom (e.g. &quot;Type of patty&quot;, &quot;Choice of rice&quot;). Option names must come from the dictionary. Set an extra amount per option (e.g. +$1.50). Customer chooses one or multiple per category when ordering.
          </p>

          {draftGroups.map((group) => (
            <div
              key={group.tempId}
              className="bg-white rounded-xl border border-stone-200 p-4 mb-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="font-medium text-stone-800">{group.name}</span>
                <span className="text-xs text-stone-500">
                  {group.required ? "Required" : "Optional"} · {group.max_selections === 1 ? "Choose one" : "Choose multiple"}
                </span>
                <button
                  type="button"
                  onClick={() => removeDraftGroup(group.tempId)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Remove category
                </button>
              </div>
              <p className="text-xs text-stone-400 mb-2">Options (name from dictionary + extra price)</p>
              <ul className="space-y-2 mb-3">
                {group.options.map((opt) => (
                  <li key={opt.tempId} className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="text"
                      value={opt.name}
                      readOnly
                      className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-stone-200 bg-stone-50"
                      placeholder="From dictionary"
                    />
                    <button
                      type="button"
                      onClick={() => openDictionary({ groupTempId: group.tempId, optionTempId: opt.tempId })}
                      className="shrink-0 px-2 py-1.5 rounded border border-amber-500 text-amber-700 text-xs font-medium hover:bg-amber-50"
                    >
                      Change
                    </button>
                    <span className="text-stone-500 text-sm">+$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={opt.price_modifier}
                      onChange={(e) => updateDraftOption(group.tempId, opt.tempId, "price_modifier", parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-2 rounded-lg border border-stone-200"
                      placeholder="0"
                    />
                    <label className="flex items-center gap-1 text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={opt.is_default}
                        onChange={(e) => updateDraftOption(group.tempId, opt.tempId, "is_default", e.target.checked)}
                      />
                      Default
                    </label>
                    <button
                      type="button"
                      onClick={() => removeDraftOption(group.tempId, opt.tempId)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {newOptionGroupTempId === group.tempId ? (
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
                    className="w-20 px-2 py-2 rounded-lg border border-stone-200 text-sm"
                    placeholder="0"
                  />
                  <label className="flex items-center gap-1 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      checked={newOptionDefault}
                      onChange={(e) => setNewOptionDefault(e.target.checked)}
                    />
                    Default
                  </label>
                  <button
                    type="button"
                    onClick={() => addDraftOption(group.tempId)}
                    disabled={!newOptionName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
                  >
                    Add option
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewOptionGroupTempId(null);
                      setNewOptionName("");
                      setNewOptionPrice("0");
                      setNewOptionDefault(false);
                    }}
                    className="text-stone-500 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewOptionGroupTempId(group.tempId)}
                  className="text-sm text-amber-700 hover:underline"
                >
                  + Add option to this category
                </button>
              )}
            </div>
          ))}

          <div className="border border-dashed border-stone-300 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-stone-700 mb-2">Add new category</p>
            <p className="text-xs text-stone-500 mb-2">Category name is custom (any text). Option names below must be from the dictionary.</p>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-stone-500 mb-1">Category name (custom)</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Type of patty, Choice of rice"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newGroupRequired}
                  onChange={(e) => setNewGroupRequired(e.target.checked)}
                />
                <span className="text-sm text-stone-600">Required</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm text-stone-600">
                  <input
                    type="radio"
                    name="newGroupMode"
                    checked={newGroupChooseOne}
                    onChange={() => setNewGroupChooseOne(true)}
                  />
                  Choose one
                </label>
                <label className="flex items-center gap-1.5 text-sm text-stone-600">
                  <input
                    type="radio"
                    name="newGroupMode"
                    checked={!newGroupChooseOne}
                    onChange={() => setNewGroupChooseOne(false)}
                  />
                  Choose multiple
                </label>
              </div>
              <button
                type="button"
                onClick={addDraftGroup}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
              >
                Add category
              </button>
            </div>
          </div>
        </section>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="py-2 px-4 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create item"}
          </button>
          <Link
            href="/admin/menu"
            className="py-2 px-4 rounded-lg border border-stone-300 text-stone-700"
          >
            Cancel
          </Link>
        </div>
      </form>

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
