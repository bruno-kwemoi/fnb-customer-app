// One-off debug script — not part of the app. Prints exactly what's
// stored on the stores record vs. what .env.local currently has, so
// a mismatch (whitespace, case, wrong value) is visible instead of
// guessed at.
//
// Usage: node scripts/debug-store.mjs

import PocketBase from "pocketbase";
import { config } from "dotenv";
config({ path: ".env.local" });

const pb = new PocketBase(process.env.POCKETBASE_URL);

async function main() {
  await pb.admins.authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL,
    process.env.POCKETBASE_ADMIN_PASSWORD
  );

  const all = await pb.collection("stores").getFullList();

  console.log(`Found ${all.length} store record(s) total:\n`);
  for (const s of all) {
    console.log(`  id: ${s.id}`);
    console.log(`  name: ${s.name}`);
    console.log(`  line_official_account_id: ${JSON.stringify(s.line_official_account_id)}`);
    console.log(`    (length ${s.line_official_account_id.length}, char codes: [${[...s.line_official_account_id].map(c => c.charCodeAt(0)).join(",")}])`);
    console.log("");
  }

  const envVal = process.env.LINE_OA_ID ?? "";
  console.log(`.env.local LINE_OA_ID: ${JSON.stringify(envVal)}`);
  console.log(`    (length ${envVal.length}, char codes: [${[...envVal].map(c => c.charCodeAt(0)).join(",")}])`);

  const match = all.find((s) => s.line_official_account_id === envVal);
  console.log(`\nExact match found: ${match ? "YES — " + match.id : "NO"}`);
}

main().catch((err) => {
  console.error("Debug script failed:", err?.response ?? err);
  process.exit(1);
});
