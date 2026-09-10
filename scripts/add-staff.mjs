// Registers a staff/admin member so they can use the LINE-based staff
// dashboard at /staff/liff/orders with their own identity, instead of
// (or alongside) the shared tablet passcode.
//
// The chicken-and-egg problem this solves: you can't add someone by
// name alone, you need their actual LINE userId — and the easiest way
// to get that is to have them open the staff LIFF link once first.
// Unregistered, they'll land on a screen showing their name + LINE
// userId to copy and send you. Run this script with those values.
//
// Usage:
//   npm run add-staff -- <lineUserId> "<display name>" [role]
//   role defaults to "staff"; pass "admin" for admin access.
//
// Safe to re-run: matches on line_user_id and updates in place rather
// than creating a duplicate, so re-running to change someone's role
// or reactivate them works fine.
//
// Required env vars (in .env.local): POCKETBASE_URL,
// POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD,
// STAFF_LINE_CHANNEL_ACCESS_TOKEN (same as
// STORE_LINE_CHANNEL_ACCESS_TOKEN — the OA's token, needed to link
// the staff rich menu to this person).
//
// Optional: STAFF_RICH_MENU_ID and ADMIN_RICH_MENU_ID — if set, this
// script links the one matching the person's role, so they see the
// right menu (2 panels for staff, 3 for admin — see
// scripts/setup-staff-rich-menu.mjs) instead of the customer one when
// they open LINE. Skipped with a note if the relevant one is unset
// (nothing breaks — they can still use the staff LIFF link directly).

import PocketBase from "pocketbase";
import { config } from "dotenv";

config({ path: ".env.local" });

const [, , lineUserId, displayName, roleArg] = process.argv;
const role = roleArg || "staff";

if (!lineUserId || !displayName) {
  console.error('Usage: npm run add-staff -- <lineUserId> "<display name>" [staff|admin]');
  process.exit(1);
}
if (!["staff", "admin"].includes(role)) {
  console.error(`Invalid role "${role}" — must be "staff" or "admin".`);
  process.exit(1);
}

const required = ["POCKETBASE_URL", "POCKETBASE_ADMIN_EMAIL", "POCKETBASE_ADMIN_PASSWORD"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const pb = new PocketBase(process.env.POCKETBASE_URL);

async function main() {
  await pb.admins.authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);
  console.log("Authenticated as admin.");

  // Mirrors resolveStoreIdServer in src/lib/store.ts — that helper
  // isn't importable here (it pulls in Next.js server-only code), so
  // duplicated rather than reused. Keep both in sync if this logic
  // changes.
  const lineOaId = process.env.LINE_OA_ID;
  if (!lineOaId) {
    console.error("LINE_OA_ID is not set — can't resolve which store to attach this staff member to.");
    process.exit(1);
  }
  const store = await pb
    .collection("stores")
    .getFirstListItem(`line_official_account_id="${lineOaId}"`)
    .catch(() => null);
  if (!store) {
    console.error("No store found matching LINE_OA_ID — run `npm run seed` first.");
    process.exit(1);
  }

  const existing = await pb
    .collection("staffs")
    .getFirstListItem(`line_user_id="${lineUserId}"`)
    .catch(() => null);

  const fields = {
    line_user_id: lineUserId,
    display_name: displayName,
    store: store.id,
    role,
    active: true,
  };

  if (existing) {
    await pb.collection("staffs").update(existing.id, fields);
    console.log(`Updated existing staff record for ${displayName} (${role}).`);
  } else {
    await pb.collection("staffs").create(fields);
    console.log(`Created staff record for ${displayName} (${role}).`);
  }

  const richMenuId = role === "admin" ? process.env.ADMIN_RICH_MENU_ID : process.env.STAFF_RICH_MENU_ID;
  const richMenuEnvVar = role === "admin" ? "ADMIN_RICH_MENU_ID" : "STAFF_RICH_MENU_ID";
  const token = process.env.STAFF_LINE_CHANNEL_ACCESS_TOKEN;
  if (!richMenuId) {
    console.log(`${richMenuEnvVar} not set — skipping rich menu link. They can still use the staff LIFF link directly.`);
    return;
  }
  if (!token) {
    console.error(`${richMenuEnvVar} is set but STAFF_LINE_CHANNEL_ACCESS_TOKEN is missing — skipping rich menu link.`);
    return;
  }

  console.log(`Linking ${role} rich menu to this user...`);
  const res = await fetch(`https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`Rich menu link failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Done — they'll see the ${role} menu next time they open LINE.`);
}

main().catch((err) => {
  console.error("add-staff failed:", err.message);
  process.exit(1);
});
