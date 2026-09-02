import { getPocketBase, getAdminPocketBase } from "./pocketbase";

// Resolves the `stores` record by its LINE OA ID — a value you already
// have from the LINE Developers console and that never changes,
// rather than the PocketBase-generated record ID (which only exists
// after seeding and has to be copied into env vars by hand).
//
// Client-side (LIFF pages): call resolveStoreId(). Cached in
// sessionStorage after the first lookup so it's one extra request per
// session, not per page.
//
// Server-side (webhook, API routes): call resolveStoreIdServer(pb)
// with an already-authenticated admin PocketBase client.

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

  const lineOaId = process.env.NEXT_PUBLIC_LINE_OA_ID;
  if (!lineOaId) throw new Error("NEXT_PUBLIC_LINE_OA_ID is not set");

  const pb = getPocketBase();
  let store;
  try {
    store = await pb
      .collection("stores")
      .getFirstListItem(`line_official_account_id="${lineOaId}"`);
  } catch (err) {
    // Surface the actual value this bundle is using — if this doesn't
    // match what's in .env.local / the PocketBase record, the client
    // bundle is stale and needs a real rebuild (stop the dev server,
    // delete .next, restart), not just a page refresh.
    throw new Error(
      `Store lookup failed for NEXT_PUBLIC_LINE_OA_ID=${JSON.stringify(lineOaId)} (length ${lineOaId.length}). Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  cachedStoreId = store.id;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("store_id", store.id);
  }
  return store.id;
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
