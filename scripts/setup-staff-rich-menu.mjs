// Creates and uploads BOTH the staff and admin Rich Menus — unlike
// setup-rich-menu.mjs (the customer one), neither is set as the
// account's default menu. Each is linked per-person by
// scripts/add-staff.mjs based on that person's role, via LINE's
// linkRichMenuToUser API, so a customer opening the same OA never
// sees either.
//
// Usage: npm run setup-staff-rich-menu
// Then: copy the two printed richMenuIds into STAFF_RICH_MENU_ID and
// ADMIN_RICH_MENU_ID in .env.local, so add-staff.mjs knows which rich
// menu to link for which role.
//
// Required env vars (in .env.local): STAFF_LINE_CHANNEL_ACCESS_TOKEN
// (same value as STORE_LINE_CHANNEL_ACCESS_TOKEN — the OA's token),
// NEXT_PUBLIC_STAFF_LIFF_ID.
//
// Safe to re-run, BUT: re-running deletes and recreates both rich
// menus, which changes their richMenuIds — anyone already linked to
// an old one silently falls back to the account's default (customer)
// menu until you update the env vars and re-run
// `npm run add-staff` for each of them.

import fs from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.STAFF_LINE_CHANNEL_ACCESS_TOKEN;
const STAFF_LIFF_ID = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;
const CUSTOMER_LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

if (!TOKEN || !STAFF_LIFF_ID || !CUSTOMER_LIFF_ID) {
  console.error(
    "Missing STAFF_LINE_CHANNEL_ACCESS_TOKEN, NEXT_PUBLIC_STAFF_LIFF_ID, or NEXT_PUBLIC_LIFF_ID in .env.local"
  );
  process.exit(1);
}

const API = "https://api.line.me/v2/bot";

const ORDERS_URI = `https://liff.line.me/${STAFF_LIFF_ID}/staff/liff/orders`;
const REPORTS_URI = `https://liff.line.me/${STAFF_LIFF_ID}/staff/liff/reports`;
const CUSTOMER_URI = `https://liff.line.me/${CUSTOMER_LIFF_ID}/liff/menu`;

const menus = [
  {
    envVar: "STAFF_RICH_MENU_ID",
    image: "staff-rich-menu.png",
    definition: {
      size: { width: 2500, height: 843 },
      selected: true,
      name: "staff-menu",
      chatBarText: "スタッフメニュー",
      areas: [
        { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: "uri", uri: ORDERS_URI } },
        { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: "uri", uri: CUSTOMER_URI } },
      ],
    },
  },
  {
    envVar: "ADMIN_RICH_MENU_ID",
    image: "admin-rich-menu.png",
    definition: {
      size: { width: 2500, height: 843 },
      selected: true,
      name: "admin-menu",
      chatBarText: "管理者メニュー",
      areas: [
        { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "uri", uri: ORDERS_URI } },
        { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "uri", uri: REPORTS_URI } },
        { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "uri", uri: CUSTOMER_URI } },
      ],
    },
  },
];

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

async function setupMenu({ envVar, image, definition }) {
  console.log(`\n--- ${definition.name} ---`);
  console.log("Checking for existing rich menu...");
  const { richmenus } = await lineFetch("/richmenu/list");
  for (const rm of richmenus.filter((r) => r.name === definition.name)) {
    console.log(`  deleting existing rich menu ${rm.richMenuId}`);
    await lineFetch(`/richmenu/${rm.richMenuId}`, { method: "DELETE" });
  }

  console.log("Creating rich menu...");
  const { richMenuId } = await lineFetch("/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(definition),
  });
  console.log(`  created ${richMenuId}`);

  console.log("Uploading image...");
  const imagePath = new URL(`../assets/${image}`, import.meta.url);
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
  return { envVar, richMenuId };
}

async function main() {
  const results = [];
  for (const menu of menus) {
    results.push(await setupMenu(menu));
  }

  console.log("\nBoth rich menus created (NOT set as account default). Add these to .env.local:");
  for (const { envVar, richMenuId } of results) {
    console.log(`${envVar}=${richMenuId}`);
  }
  console.log('\nThen run `npm run add-staff -- <lineUserId> "<name>" [staff|admin]` for each person —');
  console.log("it picks the right menu automatically based on the role you pass.");
}

main().catch((err) => {
  console.error("Rich menu setup failed:", err.message);
  process.exit(1);
});
