import type PocketBase from "pocketbase";
import { verifyLineIdToken } from "@/lib/line";

// Two ways to reach the staff dashboard, both landing here:
//
//  1. Shared tablet/passcode (x-staff-code header) — no identity,
//     matches STAFF_ACCESS_CODE. Good for a fixed kitchen/counter
//     device where "which shift is logged in" doesn't matter.
//
//  2. Personal LINE access (x-staff-id-token header) — the LIFF ID
//     token is verified against LINE directly (see verifyLineIdToken
//     in lib/line.ts), then the verified userId is looked up in the
//     `staff` PocketBase collection. This is real per-person identity
//     — unlike the customer flow, a client can't just claim a userId.
//
// Both are accepted so a physical station and individual staff phones
// can coexist; neither is "the" auth going forward if this grows past
// a single store.

export type StaffIdentity =
  | { kind: "shared_device"; displayName: string; role: "staff" }
  | { kind: "line"; lineUserId: string; displayName: string; role: "staff" | "admin"; storeId: string };

function verifyStaffCode(req: Request): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) return false;
  const provided = req.headers.get("x-staff-code");
  return provided === expected;
}

/**
 * Resolves whichever staff auth method the request used. Returns null
 * if neither succeeds — callers should respond 401 in that case.
 * Needs an admin PocketBase client to look up the `staff` collection
 * for the LINE-identity path.
 */
export async function resolveStaffIdentity(req: Request, pb: PocketBase): Promise<StaffIdentity | null> {
  if (verifyStaffCode(req)) {
    return { kind: "shared_device", displayName: "共有端末", role: "staff" };
  }

  const idToken = req.headers.get("x-staff-id-token");
  if (idToken) {
    let userId: string;
    try {
      ({ userId } = await verifyLineIdToken(idToken));
    } catch (err) {
      console.error("[staff-auth] ID token verification failed", err);
      return null;
    }

    let staff;
    try {
      staff = await pb.collection("staffs").getFirstListItem(`line_user_id="${userId}" && active=true`);
    } catch (err) {
      // getFirstListItem throws on "no match" too (a normal, expected
      // case — a genuinely unregistered person) — but it also throws
      // on a malformed filter, a schema mismatch, or a connectivity
      // problem, which look identical from here unless logged. Log
      // the verified userId alongside it so a mismatch (right person,
      // wrong ID format, wrong collection state, etc.) is diagnosable
      // from Netlify's function logs instead of just "unauthorized".
      console.error(`[staff-auth] staffs lookup failed for verified userId=${userId}`, err);
      return null;
    }

    if (!staff) return null;

    return {
      kind: "line",
      lineUserId: userId,
      displayName: staff.display_name,
      role: staff.role,
      storeId: staff.store,
    };
  }

  return null;
}
