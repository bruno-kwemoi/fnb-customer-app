// Creates and uploads the staff Rich Menu — unlike setup-rich-menu.mjs
// (the customer one), this does NOT set it as the account's default
// menu. It's linked per-person to registered staff by
// scripts/add-staff.mjs via LINE's linkRichMenuToUser API, so a
// customer opening the same OA never sees it.
//
// Usage: npm run setup-staff-rich-menu
// Then: copy the printed richMenuId into STAFF_RICH_MENU_ID in
// .env.local, so add-staff.mjs knows which rich menu to link.
//
// Required env vars (in .env.local): STAFF_LINE_CHANNEL_ACCESS_TOKEN
// (same value as STORE_LINE_CHANNEL_ACCESS_TOKEN — the OA's token),
// NEXT_PUBLIC_STAFF_LIFF_ID.
//
// Safe to re-run, BUT: re-running deletes and recreates this rich
// menu, which changes its richMenuId — any staff already linked to
// the old one will silently fall back to the account's default
// (customer) menu until you update STAFF_RICH_MENU_ID and re-run
// `npm run add-staff` for each of them. Fine while you're the only
// staff member during setup; be aware of it once real staff are
// registered.

import fs from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.STAFF_LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;

if (!TOKEN || !LIFF_ID) {
  console.error("Missing STAFF_LINE_CHANNEL_ACCESS_TOKEN or NEXT_PUBLIC_STAFF_LIFF_ID in .env.local");
  process.exit(1);
}

const API = "https://api.line.me/v2/bot";

const richMenuDefinition = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "staff-menu",
  chatBarText: "スタッフメニュー",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}/staff/liff/orders` },
    },
  ],
};

async function lineFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  console.log("Checking for existing staff rich menus...");
  const { richmenus } = await lineFetch("/richmenu/list");
  for (const rm of richmenus.filter((r) => r.name === richMenuDefinition.name)) {
    console.log(`  deleting existing staff rich menu ${rm.richMenuId}`);
    await lineFetch(`/richmenu/${rm.richMenuId}`, { method: "DELETE" });
  }

  console.log("Creating staff rich menu...");
  const { richMenuId } = await lineFetch("/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenuDefinition),
  });
  console.log(`  created ${richMenuId}`);

  console.log("Uploading image...");
  const imagePath = new URL("../assets/staff-rich-menu.png", import.meta.url);
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "image/png" },
    body: imageBuffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`Image upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  console.log("  uploaded.");

  console.log(`\nStaff rich menu ${richMenuId} is created but NOT set as default.`);
  console.log(`Add this to .env.local: STAFF_RICH_MENU_ID=${richMenuId}`);
  console.log("Then run `npm run add-staff -- <lineUserId> \"<name>\" [role]` for each staff member.");
}

main().catch((err) => {
  console.error("Staff rich menu setup failed:", err.message);
  process.exit(1);
});
