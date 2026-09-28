export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        "X-Khan-Baba-Request": "1",
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 && !path.endsWith("/login") && !path.endsWith("/session")) {
    window.location.assign("/admin/login?expired=1");
    throw new Error("Please sign in again.");
  }
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

export async function deleteIfUnused(path: string) {
  if (!path.startsWith("/images/")) return;
  try {
    await api(`/api/admin/media?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  } catch {
    // The file may still be used elsewhere.
  }
}
