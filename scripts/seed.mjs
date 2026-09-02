// Seeds one store + a starter menu into PocketBase.
// Usage: npm run seed
//
// Required env vars (put in .env.local, or export before running):
//   POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
//   STORE_LINE_OA_ID, STORE_LINE_CHANNEL_SECRET,
//   STORE_LINE_CHANNEL_ACCESS_TOKEN, STORE_LIFF_ID
//
// Optional: STORE_NAME (defaults to a placeholder — rename before
// showing this to the client).
//
// Safe to re-run: matches existing store/category/item records by
// (store, name) and updates them in place rather than creating
// duplicates. Editing prices or descriptions in MENU/CATEGORIES below
// and re-running will update the existing records, not add new ones.

import PocketBase from "pocketbase";
import { config } from "dotenv";

// Plain `dotenv` only auto-loads a file literally named `.env` — it
// doesn't know about the Next.js `.env.local` convention this project
// uses, so point it there explicitly.
config({ path: ".env.local" });

const required = [
  "POCKETBASE_URL",
  "POCKETBASE_ADMIN_EMAIL",
  "POCKETBASE_ADMIN_PASSWORD",
  "STORE_LINE_OA_ID",
  "STORE_LINE_CHANNEL_SECRET",
  "STORE_LINE_CHANNEL_ACCESS_TOKEN",
  "STORE_LIFF_ID",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error("Set these in .env.local before running the seed script.");
  process.exit(1);
}

const pb = new PocketBase(process.env.POCKETBASE_URL);

const STORE_NAME = process.env.STORE_NAME || "はるみ鉄板 心斎橋店";
const STORE_NAME_EN = process.env.STORE_NAME_EN || "Harumi Teppan (Shinsaibashi)";
const STORE_ADDRESS = process.env.STORE_ADDRESS || "";

// Menu content — adjust freely before running, or edit in the Admin
// UI afterwards. Prices are JPY integers.
const CATEGORIES = [
  { name: "お好み焼き", sort_order: 1 },
  { name: "モダン焼き", sort_order: 2 },
  { name: "鉄板焼き", sort_order: 3 },
  { name: "一品料理", sort_order: 4 },
  { name: "ドリンク", sort_order: 5 },
];

const ITEMS = [
  { category: "お好み焼き", name: "豚玉お好み焼き", name_en: "Pork Okonomiyaki", description: "大阪風・秘伝ソース", price: 980, is_recommended: true, sort_order: 1 },
  { category: "お好み焼き", name: "イカ玉お好み焼き", name_en: "Squid Okonomiyaki", price: 1080, sort_order: 2 },
  { category: "お好み焼き", name: "ミックスお好み焼き", name_en: "Mixed Okonomiyaki", price: 1280, sort_order: 3 },
  { category: "モダン焼き", name: "海鮮モダン焼き", name_en: "Seafood Modan-yaki", description: "焼きそば入り", price: 1380, is_recommended: true, sort_order: 1 },
  { category: "モダン焼き", name: "豚玉モダン焼き", name_en: "Pork Modan-yaki", price: 1180, sort_order: 2 },
  { category: "鉄板焼き", name: "牛カルビ鉄板焼き", name_en: "Beef Kalbi Teppanyaki", price: 1680, sort_order: 1 },
  { category: "鉄板焼き", name: "海老と野菜の鉄板焼き", name_en: "Shrimp & Vegetable Teppanyaki", price: 1480, sort_order: 2 },
  { category: "一品料理", name: "ねぎ焼き", name_en: "Negiyaki", description: "薄焼き・小皿", price: 780, sort_order: 1 },
  { category: "一品料理", name: "だし巻き卵", name_en: "Dashi Rolled Omelette", price: 580, sort_order: 2 },
  { category: "ドリンク", name: "生ビール", name_en: "Draft Beer", price: 580, sort_order: 1 },
  { category: "ドリンク", name: "烏龍茶", name_en: "Oolong Tea", price: 380, sort_order: 2 },
];

async function main() {
  await pb.admins.authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL,
    process.env.POCKETBASE_ADMIN_PASSWORD
  );
  console.log("Authenticated as admin.");

  let store = await pb
    .collection("stores")
    .getFirstListItem(`name="${STORE_NAME}"`)
    .catch(() => null);

  const storeFields = {
    name: STORE_NAME,
    name_en: STORE_NAME_EN,
    line_official_account_id: process.env.STORE_LINE_OA_ID,
    line_channel_secret: process.env.STORE_LINE_CHANNEL_SECRET,
    line_channel_access_token: process.env.STORE_LINE_CHANNEL_ACCESS_TOKEN,
    liff_id: process.env.STORE_LIFF_ID,
    address: STORE_ADDRESS,
    is_active: true,
  };

  if (store) {
    // Re-sync credentials every run — catches drift if the record was
    // created earlier (manually, or with different env values) and
    // the .env.local since changed. Without this, a stale
    // line_official_account_id on an existing row silently breaks
    // resolveStoreId() even after re-running the seed.
    store = await pb.collection("stores").update(store.id, storeFields);
    console.log(`Store "${STORE_NAME}" already existed (${store.id}) — re-synced its LINE credentials.`);
  } else {
    store = await pb.collection("stores").create(storeFields);
    console.log(`Created store "${STORE_NAME}" (${store.id}).`);
  }

  const categoryIds = {};
  for (const cat of CATEGORIES) {
    let record = await pb
      .collection("menu_categories")
      .getFirstListItem(`store="${store.id}" && name="${cat.name}"`)
      .catch(() => null);

    if (record) {
      record = await pb.collection("menu_categories").update(record.id, {
        sort_order: cat.sort_order,
      });
      console.log(`  category (existing): ${cat.name} (${record.id})`);
    } else {
      record = await pb.collection("menu_categories").create({
        store: store.id,
        name: cat.name,
        sort_order: cat.sort_order,
      });
      console.log(`  category (created): ${cat.name} (${record.id})`);
    }
    categoryIds[cat.name] = record.id;
  }

  for (const item of ITEMS) {
    const categoryId = categoryIds[item.category];
    if (!categoryId) {
      console.warn(`  skipping "${item.name}" — unknown category "${item.category}"`);
      continue;
    }

    const itemFields = {
      store: store.id,
      category: categoryId,
      name: item.name,
      name_en: item.name_en ?? "",
      description: item.description ?? "",
      price: item.price,
      is_available: true,
      is_recommended: item.is_recommended ?? false,
      sort_order: item.sort_order,
    };

    let record = await pb
      .collection("menu_items")
      .getFirstListItem(`store="${store.id}" && name="${item.name}"`)
      .catch(() => null);

    if (record) {
      record = await pb.collection("menu_items").update(record.id, itemFields);
      console.log(`    item (updated): ${item.name} — ¥${item.price} (${record.id})`);
    } else {
      record = await pb.collection("menu_items").create(itemFields);
      console.log(`    item (created): ${item.name} — ¥${item.price} (${record.id})`);
    }
  }

  console.log("\nDone.");
  console.log(`Store id: ${store.id} (for reference only — the app resolves this automatically via LINE_OA_ID, nothing to copy into .env.local).`);
}

main().catch((err) => {
  console.error("Seed failed:", err?.response ?? err);
  process.exit(1);
});
