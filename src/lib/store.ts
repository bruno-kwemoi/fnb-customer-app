import { getAdminPocketBase } from "./pocketbase";

// Resolves the current store's id.
//
// The `stores` collection is intentionally admin-only in PocketBase
// (it holds the LINE channel secret and access token — those must
// never be readable from the browser), so the client can't query it
// directly. Client-side resolveStoreId() instead calls a server route
// (/api/store) that does the lookup with an authenticated admin
// client and returns only the id.
//
// Server-side code (webhook, API routes) that already has an admin
// client can skip that hop and call resolveStoreIdServer() directly.

let cachedStoreId: string | null = null;

export async function resolveStoreId(): Promise<string> {
  if (cachedStoreId) return cachedStoreId;

  if (typeof window !== "undefined") {
    const cached = sessionStorage.getItem("store_id");
    if (cached) {
      cachedStoreId = cached;
      return cached;
    }
  }

  const res = await fetch("/api/store");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Store lookup failed (${res.status}): ${body}`);
  }
  const data = await res.json();

  cachedStoreId = data.id;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("store_id", data.id);
  }
  return data.id;
}

export async function resolveStoreIdServer(
  pb: Awaited<ReturnType<typeof getAdminPocketBase>>
): Promise<string> {
  const lineOaId = process.env.LINE_OA_ID;
  if (!lineOaId) throw new Error("LINE_OA_ID is not set");

  const store = await pb
    .collection("stores")
    .getFirstListItem(`line_official_account_id="${lineOaId}"`);
  return store.id;
}
