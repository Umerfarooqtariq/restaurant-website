import { useState, type FormEvent } from "react";
import type { GalleryImage } from "../../shared/schema";
import { useAdmin } from "./AdminApp";
import { api, deleteIfUnused } from "./api";
import { prepareUpload } from "./images";
import { ConfirmDialog, Field, ShellTop } from "./ui";

const categories: { value: GalleryImage["category"]; label: string }[] = [
  { value: "restaurant", label: "Exterior" },
  { value: "interior", label: "Interior" },
  { value: "food", label: "Food" },
  { value: "dishes", label: "Special dishes" },
  { value: "ambience", label: "Ambience" },
  { value: "events", label: "Events" },
  { value: "other", label: "Other" },
];

type Draft = {
  id: string;
  url: string;
  originalUrl: string;
  alt: string;
  title: string;
  category: GalleryImage["category"];
  width?: number;
  height?: number;
};

export default function GalleryManager() {
  const { content, canSave, refresh, notify } = useAdmin();
  const images = content.gallery.images;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setProgress(0);
    try {
      const uploaded = await prepareUpload(file, "gallery", setProgress);
      setDraft({ id: "", url: uploaded.path, originalUrl: "", alt: "", title: "", category: "food", width: uploaded.width, height: uploaded.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this image.");
    } finally {
      setProgress(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = { url: draft.url, alt: draft.alt, title: draft.title, category: draft.category, width: draft.width, height: draft.height };
      if (draft.id) await api(`/api/admin/gallery/${draft.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/admin/gallery", { method: "POST", body: JSON.stringify(body) });
      if (draft.originalUrl && draft.originalUrl !== draft.url) await deleteIfUnused(draft.originalUrl);
      setDraft(null);
      await refresh();
      notify("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const ids = images.map((image) => image.id);
    const next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await api("/api/admin/gallery/reorder", { method: "POST", body: JSON.stringify({ ids }) });
    await refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const image = images.find((entry) => entry.id === id);
      await api(`/api/admin/gallery/${id}`, { method: "DELETE" });
      if (image) await deleteIfUnused(image.url);
      setConfirmId(null);
      await refresh();
      notify("Image deleted.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not delete.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ShellTop title="Gallery" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="card">
        <label className="field">
          Add image
          <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={!canSave || progress !== null} onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        {progress !== null && <progress value={progress} max={100}>{progress}%</progress>}
      </div>
      <div className="list" style={{ marginTop: "1rem" }}>
        {images.map((image, index) => (
          <article key={image.id} className="row">
            <img src={image.url} alt="" width="72" height="72" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
            <div>
              <strong>{image.title || image.alt}</strong>
              <div className="badge">{categories.find((entry) => entry.value === image.category)?.label}</div>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => void move(index, -1)} disabled={index === 0}>Up</button>
              <button type="button" onClick={() => void move(index, 1)} disabled={index === images.length - 1}>Down</button>
              <button type="button" onClick={() => setDraft({ id: image.id, url: image.url, originalUrl: image.url, alt: image.alt, title: image.title, category: image.category, width: image.width, height: image.height })}>Edit</button>
              <button type="button" className="danger" onClick={() => setConfirmId(image.id)}>Delete</button>
            </div>
          </article>
        ))}
        {images.length === 0 && <p>No gallery images yet.</p>}
      </div>
      {draft && (
        <form className="card form-grid" onSubmit={save} style={{ marginTop: "1rem" }}>
          <h2>{draft.id ? "Edit image" : "New image"}</h2>
          <img src={draft.url} alt="" style={{ width: 180, borderRadius: 12 }} />
          <Field label="Alt text" hint="Describe the photo for people using screen readers."><input value={draft.alt} onChange={(event) => setDraft({ ...draft, alt: event.target.value })} required /></Field>
          <Field label="Title"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label="Gallery category">
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GalleryImage["category"] })}>
              {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </Field>
          <label className="field">
            Replace image
            <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={!canSave} onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const uploaded = await prepareUpload(file, "gallery", setProgress);
                setDraft({ ...draft, url: uploaded.path, width: uploaded.width, height: uploaded.height });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not upload this image.");
              } finally {
                setProgress(null);
              }
            }} />
          </label>
          <div className="save-bar">
            <button type="button" onClick={() => { if (!draft.id && draft.url) void deleteIfUnused(draft.url); if (draft.id && draft.url !== draft.originalUrl) void deleteIfUnused(draft.url); setDraft(null); }}>Cancel</button>
            <button type="submit" disabled={busy || !canSave}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Delete this image?"
        body="This removes it from the gallery."
        confirmLabel="Delete image"
        busy={busy}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId) void remove(confirmId); }}
      />
    </div>
  );
}
