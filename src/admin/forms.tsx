import { useEffect, useState, type FormEvent } from "react";
import type { HoursEntry, Restaurant, Settings } from "../../shared/schema";
import { useAdmin } from "./AdminApp";
import { api } from "./api";
import { Field, ImageField, SaveBar, ShellTop, releaseImage, useWarn } from "./ui";

function useServerError() {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return { error, setError, saving, setSaving };
}

export function RestaurantForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.restaurant;
  const [form, setForm] = useState(source);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => setForm(source), [source]);
  const dirty = JSON.stringify(form) !== JSON.stringify(source);
  useWarn(dirty);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/restaurant", { method: "PUT", body: JSON.stringify(form) });
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="Restaurant" />
      <div className="card form-grid">
        <Field label="Restaurant name"><input value={form.name} onChange={(event) => set("name", event.target.value)} required /></Field>
        <Field label="Tagline" hint="Shown under the name. Leave blank until you have one."><input value={form.tagline} onChange={(event) => set("tagline", event.target.value)} /></Field>
        <Field label="Short description"><textarea value={form.description} onChange={(event) => set("description", event.target.value)} /></Field>
        <Field label="City"><input value={form.city} onChange={(event) => set("city", event.target.value)} /></Field>
        <Field label="Country"><input value={form.country} onChange={(event) => set("country", event.target.value)} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => setForm(source)} />
      </div>
    </form>
  );
}

export function AboutForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.restaurant;
  const [about, setAbout] = useState(source.about);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => setAbout(source.about), [source]);
  const dirty = JSON.stringify(about) !== JSON.stringify(source.about);
  useWarn(dirty);
  const fields = [
    ["introduction", "Introduction"],
    ["story", "Story"],
    ["cuisine", "Cuisine"],
    ["specialties", "Specialties"],
    ["philosophy", "Philosophy"],
    ["ambience", "Ambience"],
    ["experience", "Experience"],
  ] as const;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/restaurant", { method: "PUT", body: JSON.stringify({ ...source, about }) });
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="About" />
      <div className="card form-grid">
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <textarea value={about[key]} onChange={(event) => setAbout((current) => ({ ...current, [key]: event.target.value }))} />
          </Field>
        ))}
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => setAbout(source.about)} />
      </div>
    </form>
  );
}

export function HoursForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.restaurant;
  const [rows, setRows] = useState(source.openingHours);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => setRows(source.openingHours), [source]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(source.openingHours);
  useWarn(dirty);

  function update(id: string, patch: Partial<HoursEntry>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/restaurant", { method: "PUT", body: JSON.stringify({ ...source, openingHours: rows }) });
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="Opening hours" />
      <div className="card form-grid">
        {rows.map((row) => (
          <div key={row.id} className="price-row">
            <Field label="Days or label"><input value={row.label} onChange={(event) => update(row.id, { label: event.target.value })} /></Field>
            <Field label="Hours"><input value={row.hours} onChange={(event) => update(row.id, { hours: event.target.value })} /></Field>
            <button type="button" onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((current) => [...current, { id: `h-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`, label: "", hours: "" }])}>Add hours</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => setRows(source.openingHours)} />
      </div>
    </form>
  );
}

export function ContactForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.restaurant;
  const [form, setForm] = useState(source);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => setForm(source), [source]);
  const dirty = JSON.stringify(form) !== JSON.stringify(source);
  useWarn(dirty);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/restaurant", { method: "PUT", body: JSON.stringify(form) });
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="Contact" />
      <div className="card form-grid">
        <Field label="Street address" hint="Shown on the contact page and in the footer."><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
        <Field label="Phone" hint="Include the country code if you like, for example +92 300 0000000."><input value={form.phone} autoComplete="tel" onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="WhatsApp" hint="Use the country code without a plus, for example 923000000000."><input value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} /></Field>
        <Field label="Google Maps link" hint="The link opened by Get Directions."><input value={form.googleMapsUrl} onChange={(event) => setForm({ ...form, googleMapsUrl: event.target.value })} /></Field>
        <Field label="Google Maps embed link" hint="Optional. Paste the iframe src from Google Maps, or the whole embed code."><textarea value={form.mapEmbedUrl} onChange={(event) => setForm({ ...form, mapEmbedUrl: event.target.value })} /></Field>
        <Field label="Facebook"><input value={form.socialLinks.facebook} onChange={(event) => setForm({ ...form, socialLinks: { ...form.socialLinks, facebook: event.target.value } })} /></Field>
        <Field label="Instagram"><input value={form.socialLinks.instagram} onChange={(event) => setForm({ ...form, socialLinks: { ...form.socialLinks, instagram: event.target.value } })} /></Field>
        <Field label="TikTok"><input value={form.socialLinks.tiktok} onChange={(event) => setForm({ ...form, socialLinks: { ...form.socialLinks, tiktok: event.target.value } })} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => setForm(source)} />
      </div>
    </form>
  );
}

export function BrandingForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.restaurant;
  const [logo, setLogo] = useState(source.logo);
  const [heroImage, setHeroImage] = useState(source.heroImage);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => {
    setLogo(source.logo);
    setHeroImage(source.heroImage);
  }, [source]);
  const dirty = logo !== source.logo || heroImage !== source.heroImage;
  useWarn(dirty);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/restaurant", { method: "PUT", body: JSON.stringify({ ...source, logo, heroImage }) });
      await releaseImage(source.logo, logo);
      await releaseImage(source.heroImage, heroImage);
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="Logo and hero" />
      <div className="card form-grid">
        <ImageField label="Restaurant logo" folder="logo" value={logo} disabled={!canSave} onChange={setLogo} />
        <ImageField label="Hero image" folder="hero" value={heroImage} disabled={!canSave} onChange={setHeroImage} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => { setLogo(source.logo); setHeroImage(source.heroImage); }} />
      </div>
    </form>
  );
}

export function SettingsForm() {
  const { content, canSave, refresh, notify } = useAdmin();
  const source = content.settings;
  const [form, setForm] = useState(source);
  const { error, setError, saving, setSaving } = useServerError();
  useEffect(() => setForm(source), [source]);
  const dirty = JSON.stringify(form) !== JSON.stringify(source);
  useWarn(dirty);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(form) });
      await refresh();
      notify("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      notify(message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={saving}>
      <ShellTop title="Settings" />
      <div className="card form-grid">
        <Field label="Restaurant status">
          <select value={form.status} onChange={(event) => set("status", event.target.value as Settings["status"])}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Currency code"><input value={form.currency} onChange={(event) => set("currency", event.target.value)} /></Field>
        <Field label="Currency symbol"><input value={form.currencySymbol} onChange={(event) => set("currencySymbol", event.target.value)} /></Field>
        <Field label="Public site URL" hint="Used for canonical links after the next deploy. Example: https://example.com"><input value={form.siteUrl} onChange={(event) => set("siteUrl", event.target.value)} /></Field>
        <Field label="SEO title"><input value={form.seoTitle} onChange={(event) => set("seoTitle", event.target.value)} /></Field>
        <Field label="SEO description"><textarea value={form.seoDescription} onChange={(event) => set("seoDescription", event.target.value)} /></Field>
        <Field label="General WhatsApp message"><textarea value={form.whatsappOrderMessage} onChange={(event) => set("whatsappOrderMessage", event.target.value)} /></Field>
        <Field label="Item WhatsApp message" hint="Use {item} where the dish name should appear."><textarea value={form.whatsappItemMessage} onChange={(event) => set("whatsappItemMessage", event.target.value)} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <SaveBar dirty={dirty} saving={saving} canSave={canSave} onCancel={() => setForm(source)} />
      </div>
    </form>
  );
}
