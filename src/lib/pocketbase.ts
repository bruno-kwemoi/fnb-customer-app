import PocketBase from "pocketbase";

// Client-side instance (browser). For server-side (API routes), create
// a fresh instance per request and authenticate as admin — see
// getAdminPocketBase() below.
export function getPocketBase() {
  return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);
}

// Server-side admin client — used in API routes (webhook, orders) that
// need to write across collections without per-user auth rules.
//
// Caches the authenticated instance at module scope so a warm
// serverless invocation reuses the existing session instead of
// re-authenticating (a full network round-trip) on every single
// request. Cold starts still pay for one auth call, same as before.
let cachedAdminPb: PocketBase | null = null;

export async function getAdminPocketBase() {
  if (cachedAdminPb?.authStore.isValid) {
    return cachedAdminPb;
  }

  const pb = new PocketBase(process.env.POCKETBASE_URL);
  await pb.admins.authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL!,
    process.env.POCKETBASE_ADMIN_PASSWORD!
  );
  cachedAdminPb = pb;
  return pb;
}
