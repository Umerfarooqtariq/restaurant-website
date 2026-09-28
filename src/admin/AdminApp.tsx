import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import type { Gallery, Menu, Restaurant, Settings } from "../../shared/schema";
import { api } from "./api";
import { ShellTop } from "./ui";
import { AboutForm, BrandingForm, ContactForm, HoursForm, RestaurantForm, SettingsForm } from "./forms";
import GalleryManager from "./GalleryManager";
import MenuManager from "./MenuManager";

type Content = { restaurant: Restaurant; menu: Menu; gallery: Gallery; settings: Settings };
type Persistence = "filesystem" | "github" | "unconfigured";
type AdminContextValue = {
  content: Content;
  persistence: Persistence;
  canSave: boolean;
  refresh: () => Promise<void>;
  notify: (message: string, type?: "ok" | "err") => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);
export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("Admin data is unavailable.");
  return value;
}

const links = [
  ["/", "Dashboard"],
  ["/restaurant", "Restaurant"],
  ["/about", "About"],
  ["/hours", "Opening hours"],
  ["/contact", "Contact"],
  ["/menu", "Menu"],
  ["/gallery", "Gallery"],
  ["/branding", "Logo & hero"],
  ["/settings", "Settings"],
];

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const expired = new URLSearchParams(window.location.search).get("expired") === "1";

  useEffect(() => {
    api<{ authenticated: boolean; configured: boolean }>("/api/admin/session")
      .then((data) => {
        setConfigured(data.configured);
        if (data.authenticated) navigate("/", { replace: true });
      })
      .catch(() => setConfigured(true));
  }, [navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      window.location.assign("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="badge">Khan Baba</p>
        <h1>Admin sign in</h1>
        {expired && <p role="status">Your session has ended. Sign in again.</p>}
        {!configured && <p className="form-error">Admin sign-in is not configured yet. Add the environment variables, then redeploy.</p>}
        <div className="form-grid">
          <label className="field">Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="save-bar">
          <button type="submit" disabled={busy || !configured}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
      </form>
    </div>
  );
}

function RequireAuth() {
  const [status, setStatus] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    api<{ authenticated: boolean }>("/api/admin/session")
      .then((data) => setStatus(data.authenticated ? "in" : "out"))
      .catch(() => setStatus("out"));
  }, []);
  if (status === "loading") return <p className="admin-fallback">Loading admin…</p>;
  if (status === "out") return <Navigate to="/login" replace />;
  return <DataProvider />;
}

function DataProvider() {
  const [content, setContent] = useState<Content | null>(null);
  const [persistence, setPersistence] = useState<Persistence>("filesystem");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "ok" | "err" } | null>(null);

  async function refresh() {
    const data = await api<Content & { persistence: Persistence }>("/api/admin/content");
    setContent({ restaurant: data.restaurant, menu: data.menu, gallery: data.gallery, settings: data.settings });
    setPersistence(data.persistence);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  const notify = (message: string, type: "ok" | "err" = "ok") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  };
  const value = useMemo<AdminContextValue | null>(() => {
    if (!content) return null;
    return { content, persistence, canSave: persistence !== "unconfigured", refresh, notify };
  }, [content, persistence]);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <strong>Khan Baba</strong>
        <nav className="admin-nav" aria-label="Admin">
          {links.map(([href, label]) => (
            <NavLink key={href} to={href} end={href === "/"} className={({ isActive }) => (isActive ? "active" : undefined)}>{label}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => refresh().catch((err: Error) => setError(err.message))}>Retry</button></p>}
        {!content && !error && <p>Loading…</p>}
        {value && (
          <AdminContext.Provider value={value}>
            <Outlet />
          </AdminContext.Provider>
        )}
      </div>
      {toast && <div className={`toast ${toast.type === "err" ? "err" : ""}`} role="status">{toast.message}</div>}
    </div>
  );
}

function Dashboard() {
  const { content, persistence, canSave, refresh, notify } = useAdmin();
  const items = content.menu.categories.reduce((sum, category) => sum + category.items.length, 0);
  const demo = content.menu.categories.some((category) => category.demo || category.items.some((item) => item.demo));
  const [busy, setBusy] = useState(false);

  async function clearDemo() {
    if (!window.confirm("Remove all sample menu categories and dishes?")) return;
    setBusy(true);
    try {
      await api("/api/admin/menu/clear-demo", { method: "POST" });
      await refresh();
      notify("Sample menu removed.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not remove the sample menu.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ShellTop title="Dashboard" />
      <p className="note">
        {persistence === "github" && "Saves are committed to the Git repository. The public site updates after Netlify finishes rebuilding."}
        {persistence === "filesystem" && "Saves update the project files on this computer. Refresh the public site to see them."}
        {persistence === "unconfigured" && "Saving is unavailable until the Git repository environment variables are set on Netlify."}
      </p>
      <div className="stats">
        <article className="card"><span>Categories</span><strong>{content.menu.categories.length}</strong></article>
        <article className="card"><span>Food items</span><strong>{items}</strong></article>
        <article className="card"><span>Gallery images</span><strong>{content.gallery.images.length}</strong></article>
        <article className="card"><span>Status</span><strong>{content.settings.status === "open" ? "Open" : "Closed"}</strong></article>
      </div>
      <div className="row-actions">
        <a className="text-btn primary" href="/admin/menu">Edit menu</a>
        <a className="text-btn" href="/admin/restaurant">Edit restaurant</a>
        <a className="text-btn" href="/admin/contact">Edit contact</a>
        <a className="text-btn" href="/admin/gallery">Edit gallery</a>
        {demo && <button type="button" onClick={() => void clearDemo()} disabled={!canSave || busy}>{busy ? "Removing…" : "Remove sample menu"}</button>}
      </div>
    </>
  );
}

export default function AdminApp() {
  useEffect(() => {
    document.getElementById("admin-fallback")?.remove();
  }, []);
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Dashboard />} />
          <Route path="restaurant" element={<RestaurantForm />} />
          <Route path="about" element={<AboutForm />} />
          <Route path="hours" element={<HoursForm />} />
          <Route path="contact" element={<ContactForm />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="gallery" element={<GalleryManager />} />
          <Route path="branding" element={<BrandingForm />} />
          <Route path="settings" element={<SettingsForm />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

