import { useEffect, useState, type FormEvent } from "react";
import type { MenuCategory, MenuItem } from "../../shared/schema";
import { useAdmin } from "./AdminApp";
import { api, deleteIfUnused } from "./api";
import { ConfirmDialog, Field, ImageField, ShellTop } from "./ui";

type PriceDraft = { id: string; label: string; amount: string };
type ItemDraft = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  image: string;
  originalImage: string;
  prices: PriceDraft[];
  featured: boolean;
  available: boolean;
  demo: boolean;
};
type CategoryDraft = { id: string; name: string; description: string; image: string; originalImage: string; demo: boolean };
type ConfirmState = { title: string; body: string; confirmLabel: string; run: () => Promise<void> } | null;

function priceId() {
  return `p${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter a valid price, or leave it blank.");
  return Number(trimmed);
}

function itemDraft(item: MenuItem, categoryId: string): ItemDraft {
  return {
    id: item.id,
    categoryId,
    name: item.name,
    description: item.description,
    image: item.image,
    originalImage: item.image,
    prices: item.prices.map((price) => ({ id: price.id, label: price.label, amount: price.amount === null ? "" : String(price.amount) })),
    featured: item.featured,
    available: item.available,
    demo: Boolean(item.demo),
  };
}

export default function MenuManager() {
  const { content, canSave, refresh, notify } = useAdmin();
  const categories = content.menu.categories;
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [itemDraftState, setItemDraft] = useState<ItemDraft | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = categories.find((category) => category.id === categoryId) ?? categories[0];

  useEffect(() => {
    if (selected && selected.id !== categoryId) setCategoryId(selected.id);
    if (!selected) setCategoryId("");
  }, [selected, categoryId]);

  async function moveCategory(index: number, direction: -1 | 1) {
    const ids = categories.map((category) => category.id);
    const next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await api("/api/admin/categories/reorder", { method: "POST", body: JSON.stringify({ ids }) });
    await refresh();
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (!selected) return;
    const ids = selected.items.map((item) => item.id);
    const next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await api("/api/admin/items/reorder", { method: "POST", body: JSON.stringify({ categoryId: selected.id, ids }) });
    await refresh();
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryDraft || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = { name: categoryDraft.name, description: categoryDraft.description, image: categoryDraft.image, demo: categoryDraft.demo };
      if (categoryDraft.id) {
        await api(`/api/admin/categories/${categoryDraft.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/admin/categories", { method: "POST", body: JSON.stringify(body) });
      }
      await deleteIfUnused(categoryDraft.originalImage === categoryDraft.image ? "" : categoryDraft.originalImage);
      setCategoryDraft(null);
      await refresh();
      notify("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!itemDraftState || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        categoryId: itemDraftState.categoryId,
        name: itemDraftState.name,
        description: itemDraftState.description,
        image: itemDraftState.image,
        prices: itemDraftState.prices.map((price) => ({ id: price.id, label: price.label, amount: parseAmount(price.amount) })),
        featured: itemDraftState.featured,
        available: itemDraftState.available,
        demo: itemDraftState.demo,
      };
      if (itemDraftState.id) {
        await api(`/api/admin/items/${itemDraftState.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/admin/items", { method: "POST", body: JSON.stringify(body) });
      }
      if (itemDraftState.originalImage && itemDraftState.originalImage !== itemDraftState.image) {
        await deleteIfUnused(itemDraftState.originalImage);
      }
      setItemDraft(null);
      await refresh();
      notify("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function askDeleteCategory(category: MenuCategory) {
    setConfirm({
      title: `Delete ${category.name}?`,
      body: category.items.length
        ? `This will also delete ${category.items.length} menu item${category.items.length === 1 ? "" : "s"}.`
        : "This category has no dishes.",
      confirmLabel: "Delete category",
      run: async () => {
        setBusy(true);
        try {
          const force = category.items.length > 0 ? "?force=true" : "";
          await api(`/api/admin/categories/${category.id}${force}`, { method: "DELETE" });
          setConfirm(null);
          await refresh();
          notify("Category deleted.");
        } catch (err) {
          notify(err instanceof Error ? err.message : "Could not delete.", "err");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function askDeleteItem(item: MenuItem) {
    setConfirm({
      title: `Delete ${item.name}?`,
      body: "This removes the dish from the menu.",
      confirmLabel: "Delete dish",
      run: async () => {
        setBusy(true);
        try {
          await api(`/api/admin/items/${item.id}`, { method: "DELETE" });
          setConfirm(null);
          await refresh();
          notify("Dish deleted.");
        } catch (err) {
          notify(err instanceof Error ? err.message : "Could not delete.", "err");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <div>
      <ShellTop title="Menu" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="split">
        <section className="card">
          <div className="row-actions">
            <h2>Categories</h2>
            <button type="button" disabled={!canSave} onClick={() => setCategoryDraft({ id: "", name: "", description: "", image: "", originalImage: "", demo: false })}>Add category</button>
          </div>
          <div className="list">
            {categories.map((category, index) => (
              <div key={category.id} className="row">
                <button type="button" onClick={() => setCategoryId(category.id)}>{category.name}</button>
                <div className="row-actions">
                  <button type="button" onClick={() => void moveCategory(index, -1)} disabled={index === 0}>Up</button>
                  <button type="button" onClick={() => void moveCategory(index, 1)} disabled={index === categories.length - 1}>Down</button>
                  <button type="button" onClick={() => setCategoryDraft({ id: category.id, name: category.name, description: category.description, image: category.image, originalImage: category.image, demo: Boolean(category.demo) })}>Edit</button>
                  <button type="button" className="danger" onClick={() => askDeleteCategory(category)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="row-actions">
            <h2>{selected ? selected.name : "Dishes"}</h2>
            {selected && (
              <button type="button" disabled={!canSave} onClick={() => setItemDraft({
                id: "",
                categoryId: selected.id,
                name: "",
                description: "",
                image: "",
                originalImage: "",
                prices: [{ id: priceId(), label: "Price", amount: "" }],
                featured: false,
                available: true,
                demo: false,
              })}>Add dish</button>
            )}
          </div>
          <div className="list">
            {selected?.items.map((item, index) => (
              <div key={item.id} className="row">
                <div>
                  <strong>{item.name}</strong>
                  <div>
                    {item.featured && <span className="badge">Featured </span>}
                    {!item.available && <span className="badge">Unavailable </span>}
                    {item.demo && <span className="badge">Sample</span>}
                  </div>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => void moveItem(index, -1)} disabled={index === 0}>Up</button>
                  <button type="button" onClick={() => void moveItem(index, 1)} disabled={!selected || index === selected.items.length - 1}>Down</button>
                  <button type="button" onClick={() => setItemDraft(itemDraft(item, selected.id))}>Edit</button>
                  <button type="button" className="danger" onClick={() => askDeleteItem(item)}>Delete</button>
                </div>
              </div>
            ))}
            {selected && selected.items.length === 0 && <p>No dishes in this category yet.</p>}
          </div>
        </section>
      </div>

      {categoryDraft && (
        <form className="card form-grid" onSubmit={saveCategory} style={{ marginTop: "1rem" }}>
          <h2>{categoryDraft.id ? "Edit category" : "New category"}</h2>
          <Field label="Name"><input value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} required /></Field>
          <Field label="Description"><textarea value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} /></Field>
          <ImageField label="Category image" folder="menu" value={categoryDraft.image} disabled={!canSave} onChange={(image) => setCategoryDraft({ ...categoryDraft, image })} />
          {categoryDraft.demo && <label className="check"><input type="checkbox" checked={categoryDraft.demo} onChange={(event) => setCategoryDraft({ ...categoryDraft, demo: event.target.checked })} /> Sample category</label>}
          <div className="save-bar">
            <button type="button" onClick={() => { if (categoryDraft.image !== categoryDraft.originalImage) void deleteIfUnused(categoryDraft.image); setCategoryDraft(null); }}>Cancel</button>
            <button type="submit" disabled={busy || !canSave}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}

      {itemDraftState && (
        <form className="card form-grid" onSubmit={saveItem} style={{ marginTop: "1rem" }}>
          <h2>{itemDraftState.id ? "Edit dish" : "New dish"}</h2>
          <Field label="Food name"><input value={itemDraftState.name} onChange={(event) => setItemDraft({ ...itemDraftState, name: event.target.value })} required /></Field>
          <Field label="Description"><textarea value={itemDraftState.description} onChange={(event) => setItemDraft({ ...itemDraftState, description: event.target.value })} /></Field>
          <Field label="Category">
            <select value={itemDraftState.categoryId} onChange={(event) => setItemDraft({ ...itemDraftState, categoryId: event.target.value })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <ImageField label="Food image" folder="menu" value={itemDraftState.image} disabled={!canSave} onChange={(image) => setItemDraft({ ...itemDraftState, image })} />
          <div>
            <strong>Pricing</strong>
            {itemDraftState.prices.map((price, index) => (
              <div key={price.id} className="price-row">
                <Field label="Label"><input value={price.label} onChange={(event) => setItemDraft({ ...itemDraftState, prices: itemDraftState.prices.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry) })} /></Field>
                <Field label="Amount (Rs.)" hint="Leave blank if the price is not set yet."><input inputMode="decimal" value={price.amount} onChange={(event) => setItemDraft({ ...itemDraftState, prices: itemDraftState.prices.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount: event.target.value } : entry) })} /></Field>
                <button type="button" disabled={itemDraftState.prices.length === 1} onClick={() => setItemDraft({ ...itemDraftState, prices: itemDraftState.prices.filter((entry) => entry.id !== price.id) })}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setItemDraft({ ...itemDraftState, prices: [...itemDraftState.prices, { id: priceId(), label: "", amount: "" }] })}>Add price option</button>
          </div>
          <label className="check"><input type="checkbox" checked={itemDraftState.featured} onChange={(event) => setItemDraft({ ...itemDraftState, featured: event.target.checked })} /> Featured</label>
          <label className="check"><input type="checkbox" checked={itemDraftState.available} onChange={(event) => setItemDraft({ ...itemDraftState, available: event.target.checked })} /> Available</label>
          {itemDraftState.demo && <label className="check"><input type="checkbox" checked={itemDraftState.demo} onChange={(event) => setItemDraft({ ...itemDraftState, demo: event.target.checked })} /> Sample dish</label>}
          <div className="save-bar">
            <button type="button" onClick={() => { if (itemDraftState.image !== itemDraftState.originalImage) void deleteIfUnused(itemDraftState.image); setItemDraft(null); }}>Cancel</button>
            <button type="submit" disabled={busy || !canSave}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        body={confirm?.body || ""}
        confirmLabel={confirm?.confirmLabel || "Delete"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirm?.run()}
      />
    </div>
  );
}
