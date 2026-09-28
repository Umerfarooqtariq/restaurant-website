import { useEffect, useRef, useState } from "react";
import type { GalleryImage } from "../../shared/schema";

const labels: Record<GalleryImage["category"], string> = {
  restaurant: "Exterior",
  interior: "Interior",
  food: "Food",
  dishes: "Special dishes",
  ambience: "Ambience",
  events: "Events",
  other: "Other",
};

export default function GalleryView({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const current = index === null ? null : images[index];

  useEffect(() => {
    const node = dialogRef.current;
    if (!node || index === null) return;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
    };
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((value) => (value === null ? value : (value + 1) % images.length));
      if (event.key === "ArrowLeft") setIndex((value) => (value === null ? value : (value - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length]);

  return (
    <>
      <div className="gallery-grid">
        {images.map((image, imageIndex) => (
          <button key={image.id} type="button" className="gallery-card" onClick={() => setIndex(imageIndex)} style={image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined}>
            <img src={image.url} alt={image.alt} loading="lazy" width={image.width} height={image.height} />
            <span>{image.title || labels[image.category]}</span>
          </button>
        ))}
      </div>
      <dialog ref={dialogRef} className="lightbox" aria-label="Gallery image" onClose={() => setIndex(null)}>
        {current && (
          <div className="lightbox-card">
            <img src={current.url} alt={current.alt} />
            <div className="lightbox-bar">
              <button type="button" className="btn btn-ghost" onClick={() => setIndex((value) => (value === null ? value : (value - 1 + images.length) % images.length))}>Previous</button>
              <p>{(index ?? 0) + 1} / {images.length}</p>
              <button type="button" className="btn btn-ghost" onClick={() => setIndex((value) => (value === null ? value : (value + 1) % images.length))}>Next</button>
              <button type="button" className="btn btn-gold" onClick={() => dialogRef.current?.close()}>Close</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
