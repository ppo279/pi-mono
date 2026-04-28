const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export async function apiLogin(username: string, password: string): Promise<{ token: string; expiresIn: number; mustChangePassword: boolean }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Required for Cookie
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function apiMe(): Promise<{ id: number; username: string; role: string; mustChangePassword: 0 | 1 }> {
  const res = await fetch(`${API_BASE}/api/me`, {
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.href = "/";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export async function apiGetUsers(): Promise<Array<{ id: number; username: string; role: string; createdAt: number; mustChangePassword: 0 | 1; enabled: 0 | 1 }>> {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiCreateUser(username: string, password: string, role: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export async function apiUpdateUser(id: number, data: { role?: string; enabled?: 0 | 1 }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiDeleteUser(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiResetPassword(id: number, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}