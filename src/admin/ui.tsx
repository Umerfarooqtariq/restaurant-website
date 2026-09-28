import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, deleteIfUnused } from "./api";
import { prepareUpload, type ImageFolder } from "./images";

export function ShellTop({ title }: { title: string }) {
  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }
  return (
    <div className="admin-top">
      <h1>{title}</h1>
      <button type="button" onClick={() => void logout()}>Log out</button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function SaveBar({
  dirty,
  saving,
  canSave,
  onCancel,
}: {
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="save-bar">
      <button type="button" onClick={onCancel} disabled={!dirty || saving}>Cancel</button>
      <button type="submit" disabled={!dirty || saving || !canSave}>{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

export function useWarn(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);
}

export function ImageField({
  label,
  folder,
  value,
  disabled,
  onChange,
}: {
  label: string;
  folder: ImageFolder;
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
}) {
  const id = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setProgress(0);
    try {
      const uploaded = await prepareUpload(file, folder, setProgress);
      onChange(uploaded.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this image.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="image-field">
      <span>{label}</span>
      {value && <img src={value} alt="" />}
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled || progress !== null} onChange={(event) => void onFile(event.target.files?.[0])} />
      {progress !== null && <progress value={progress} max={100}>{progress}%</progress>}
      {value && <button type="button" onClick={() => onChange("")} disabled={disabled}>Remove image</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export async function releaseImage(previous: string, next: string) {
  if (previous && previous !== next) await deleteIfUnused(previous);
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !open) return;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
    };
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" onClose={onCancel}>
      <h2 id="confirm-title">{title}</h2>
      <p>{body}</p>
      <div className="save-bar">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="danger" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </dialog>
  );
}
