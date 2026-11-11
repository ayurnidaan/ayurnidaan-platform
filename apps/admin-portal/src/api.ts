import { supabase } from "./supabase";

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await token();
  const response = await fetch(`/api/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The admin service could not complete this request.");
  return body as T;
}

export function patchResource(resource: string, id: string, updates: Record<string, unknown>) {
  return adminApi(`${resource}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function createResource(resource: string, values: Record<string, unknown>) {
  return adminApi(resource, { method: "POST", body: JSON.stringify(values) });
}
