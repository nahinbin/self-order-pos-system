"use client";

import { useEffect, useState } from "react";

type Settings = {
  id: number;
  name: string;
  displayName: string;
  logoUrl: string | null;
  address: string;
  phone: string;
  receiptNote: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!mounted) return;
        setSettings(data);
      })
      .catch(() => {
        if (!mounted) return;
        setError("Failed to load settings");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save settings");
      }
      setSettings(data);
      setSuccess("Settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    if (file.size > 4 * 1024 * 1024) {
      setError("Logo must be smaller than 4MB");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Upload failed");
      }
      setSettings((prev) =>
        prev ? { ...prev, logoUrl: data.url as string } : prev
      );
      setSuccess("Logo uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      e.target.value = "";
    }
  }

  if (loading && !settings) {
    return (
      <div className="py-16 flex justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-red-500">Unable to load settings.</p>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Restaurant settings</h1>
        <p className="text-sm text-stone-500 mt-1">
          Update your restaurant name, logo, and details. These appear in the
          admin navbar, customer pages, and PDFs/receipts.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Branding
          </h2>
          <div className="space-y-3 rounded-2xl bg-white border border-stone-200 p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] sm:items-start">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-800">
                    Restaurant name
                  </label>
                  <p className="text-xs text-stone-500 mb-1">
                    Internal name used across the system.
                  </p>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    value={settings.name}
                    onChange={(e) =>
                      setSettings({ ...settings, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-800">
                    Display name
                  </label>
                  <p className="text-xs text-stone-500 mb-1">
                    Shown to guests on the navbar, order pages, and PDFs. Leave
                    blank to use the restaurant name.
                  </p>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    value={settings.displayName}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        displayName: e.target.value,
                      })
                    }
                    placeholder={settings.name}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-stone-800">
                  Logo
                </label>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-stone-100 flex items-center justify-center overflow-hidden border border-dashed border-stone-200">
                    {settings.logoUrl ? (
                      <img
                        src={settings.logoUrl}
                        alt={settings.displayName || settings.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-stone-400">Logo</span>
                    )}
                  </div>
                  <label className="inline-flex items-center px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-medium cursor-pointer hover:bg-stone-800">
                    <span>Upload logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                  </label>
                </div>
                <p className="text-xs text-stone-400">
                  JPEG, PNG, WebP, or GIF. Max 4MB. Stored in Cloudinary when
                  configured.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
            Contact & receipts
          </h2>
          <div className="space-y-3 rounded-2xl bg-white border border-stone-200 p-5">
            <div>
              <label className="block text-sm font-medium text-stone-800">
                Address
              </label>
              <textarea
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                rows={2}
                value={settings.address}
                onChange={(e) =>
                  setSettings({ ...settings, address: e.target.value })
                }
                placeholder="Street, city, postcode"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-800">
                Phone
              </label>
              <input
                type="tel"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                value={settings.phone}
                onChange={(e) =>
                  setSettings({ ...settings, phone: e.target.value })
                }
                placeholder="+1 555 123 4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-800">
                Receipt footer note
              </label>
              <textarea
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                rows={2}
                value={settings.receiptNote}
                onChange={(e) =>
                  setSettings({ ...settings, receiptNote: e.target.value })
                }
                placeholder="Thank you for dining with us!"
              />
              <p className="text-xs text-stone-400 mt-1">
                Used at the bottom of invoices, receipts, and PDFs.
              </p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-amber-500 text-stone-900 text-sm font-semibold shadow-sm hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

