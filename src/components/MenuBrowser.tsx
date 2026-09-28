import { useEffect, useMemo, useRef, useState } from "react";
import { formatAmount } from "../../shared/display";
import type { MenuCategory } from "../../shared/schema";

type Props = {
  categories: MenuCategory[];
  currencySymbol: string;
  initialCategory: string;
};

export default function MenuBrowser({ categories, currencySymbol, initialCategory }: Props) {
  const known = categories.some((category) => category.id === initialCategory);
  const [categoryId, setCategoryId] = useState(known ? initialCategory : "all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const visible = useMemo(
    () => (categoryId === "all" ? categories : categories.filter((category) => category.id === categoryId)),
    [categories, categoryId],
  );
  const active = categories.flatMap((category) => category.items.map((item) => ({ category, item }))).find((entry) => entry.item.id === activeId) ?? null;

  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (id && categories.some((category) => category.items.some((item) => item.id === id))) setActiveId(id);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [categories]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node || !active) return;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
    };
  }, [active]);

  function chooseCategory(id: string) {
    setCategoryId(id);
    const url = new URL(window.location.href);
    if (id === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <div className="chip-row" role="toolbar" aria-label="Menu categories">
        <button type="button" className="chip" aria-pressed={categoryId === "all"} onClick={() => chooseCategory("all")}>All</button>
        {categories.map((category) => (
          <button key={category.id} type="button" className="chip" aria-pressed={categoryId === category.id} onClick={() => chooseCategory(category.id)}>
            {category.name}
          </button>
        ))}
      </div>
      {visible.map((category) => (
        <section key={category.id} className="section" aria-labelledby={`cat-${category.id}`} style={{ paddingTop: "1rem" }}>
          <header className="section-head">
            <h2 id={`cat-${category.id}`}>{category.name}</h2>
            {category.description && <p className="lede">{category.description}</p>}
          </header>
          <div className="dish-grid">
            {category.items.map((item) => (
              <article key={item.id} id={item.id} className={item.available ? "dish-card" : "dish-card is-unavailable"}>
                <button type="button" className="dish-open" onClick={() => setActiveId(item.id)}>
                  <div className="dish-media">
                    {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="media-fallback" aria-hidden="true">{item.name.slice(0, 1)}</div>}
                    {item.featured && <span className="badge">Featured</span>}
                    {item.demo && <span className="badge">Sample</span>}
                  </div>
                  <div className="dish-body">
                    <h3>{item.name}</h3>
                    {item.description && <p>{item.description}</p>}
                    <ul className="price-list">
                      {item.prices.map((price) => (
                        <li key={price.id}><span>{price.label}</span><span>{formatAmount(price.amount, currencySymbol)}</span></li>
                      ))}
                    </ul>
                  </div>
                </button>
                {item.available ? (
                  <button className="btn btn-line" type="button" data-order data-item={item.name}>Order Now</button>
                ) : <p className="unavailable">Unavailable</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
      <dialog ref={dialogRef} className="detail-dialog" aria-labelledby="dish-title" onClose={() => setActiveId(null)}>
        {active && (
          <div className="detail-card">
            {active.item.image && <img src={active.item.image} alt={active.item.name} />}
            <div className="detail-copy">
              <p className="eyebrow">{active.category.name}</p>
              <h2 id="dish-title">{active.item.name}</h2>
              {active.item.description && <p className="lede">{active.item.description}</p>}
              <ul className="price-list">
                {active.item.prices.map((price) => (
                  <li key={price.id}><span>{price.label}</span><span>{formatAmount(price.amount, currencySymbol)}</span></li>
                ))}
              </ul>
              <div className="stack">
                {active.item.available ? (
                  <button className="btn btn-gold" type="button" data-order data-item={active.item.name}>Order Now</button>
                ) : <p className="unavailable">Unavailable</p>}
                <button className="btn btn-ghost" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
