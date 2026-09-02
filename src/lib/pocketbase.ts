import PocketBase from "pocketbase";

// Client-side instance (browser). For server-side (API routes), create
// a fresh instance per request and authenticate as admin — see
// getAdminPocketBase() below.
export function getPocketBase() {
  return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);
}

// Server-side admin client — used in API routes (webhook, orders) that
// need to write across collections without per-user auth rules.
export async function getAdminPocketBase() {
  const pb = new PocketBase(process.env.POCKETBASE_URL);
  await pb.admins.authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL!,
    process.env.POCKETBASE_ADMIN_PASSWORD!
  );
  return pb;
}
