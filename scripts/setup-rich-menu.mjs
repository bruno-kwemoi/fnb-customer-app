// Creates the customer-facing Rich Menu, uploads its image, and sets
// it as the default menu for every follower of this store's OA.
//
// Usage: npm run setup-rich-menu
//
// Required env vars (in .env.local): STORE_LINE_CHANNEL_ACCESS_TOKEN,
// NEXT_PUBLIC_LIFF_ID (used to build the tap-area URLs).
//
// Safe to re-run: deletes any existing rich menu(s) on this channel
// before creating the new one, so re-running after editing
// assets/rich-menu.png or the tap areas below just replaces it.

import fs from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.STORE_LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

if (!TOKEN || !LIFF_ID) {
  console.error("Missing STORE_LINE_CHANNEL_ACCESS_TOKEN or NEXT_PUBLIC_LIFF_ID in .env.local");
  process.exit(1);
}

const API = "https://api.line.me/v2/bot";

// Three tap areas matching assets/rich-menu.png (2500x843, split into
// three equal columns). Edit both the image and these areas together
// if you change the layout.
const richMenuDefinition = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "customer-main-menu",
  chatBarText: "メニュー",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}/liff/menu` },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}/liff/orders` },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}/liff/loyalty` },
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
  console.log("Checking for existing rich menus...");
  const { richmenus } = await lineFetch("/richmenu/list");
  // Only remove rich menus THIS script created (matched by name) —
  // a staff rich menu (see setup-staff-rich-menu.mjs) can coexist on
  // the same channel now and must not get swept up here.
  for (const rm of richmenus.filter((r) => r.name === richMenuDefinition.name)) {
    console.log(`  deleting existing rich menu ${rm.richMenuId} ("${rm.name}")`);
    await lineFetch(`/richmenu/${rm.richMenuId}`, { method: "DELETE" });
  }

  console.log("Creating rich menu...");
  const { richMenuId } = await lineFetch("/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenuDefinition),
  });
  console.log(`  created ${richMenuId}`);

  console.log("Uploading image...");
  const imagePath = new URL("../assets/rich-menu.png", import.meta.url);
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

  console.log("Setting as default for all followers...");
  await lineFetch(`/user/all/richmenu/${richMenuId}`, { method: "POST" });
  console.log("  done.");

  console.log(`\nRich menu ${richMenuId} is live. New and existing followers will see it.`);
}

main().catch((err) => {
  console.error("Rich menu setup failed:", err.message);
  process.exit(1);
});
