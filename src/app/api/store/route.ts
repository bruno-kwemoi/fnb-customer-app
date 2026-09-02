import { NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { resolveStoreIdServer } from "@/lib/store";

// The `stores` collection is intentionally admin-only in PocketBase —
// it holds the LINE channel secret and access token, which must never
// reach the browser. This route is the only sanctioned way the client
// learns the store's ID: it does the lookup server-side (already
// authenticated as admin) and returns just the ID, nothing else.
export async function GET() {
  try {
    const pb = await getAdminPocketBase();
    const id = await resolveStoreIdServer(pb);
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Store lookup failed" },
      { status: 404 }
    );
  }
}
