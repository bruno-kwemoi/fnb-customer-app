# Customer-Facing LINE Ordering — F&B DX (Phase 1)

Real implementation of the **Customer-Facing LINE Account** side of the
[Feature Requirement] doc: guest ordering + loyalty, on the same stack
as `line-retail-tool` (Next.js App Router, LIFF, PocketBase).

This is a drop-in addition, not a standalone repo — copy `src/app/liff`,
`src/app/api`, `src/lib`, and `src/types` into the existing codebase and
resolve any naming collisions with what's already there.

## What's included

- **Menu browsing** (`/liff/menu`) — categories + items pulled from
  PocketBase, add-to-cart with a sticky cart bar.
- **Cart & checkout** (`/liff/cart`) — quantity editing, dine-in/takeout
  toggle, table number capture, order submission.
- **Loyalty** (`/liff/loyalty`) — points balance + tier display.
- **Order API** (`/api/orders`) — writes the order, credits loyalty
  points (1pt / ¥100, adjust to the client's real program), pushes a
  LINE confirmation message.
- **Webhook** (`/api/line/webhook`) — verifies LINE's signature,
  registers new followers as `customers` records, handles a `ポイント`
  keyword as a fallback outside the LIFF flow.
- **PocketBase schema** (`pocketbase/schema.json`) — `stores`,
  `menu_categories`, `menu_items`, `customers`, `orders`. Import via
  the PocketBase admin UI.
- **Rich Menu** (`scripts/setup-rich-menu.mjs`, `assets/rich-menu.png`)
  — creates and registers the persistent two-button chat menu (注文する
  / ポイント確認) as the default for all followers.

## Setup

1. Copy `.env.local.example` → `.env.local`, fill in the LINE channel
   credentials and LIFF ID from your Developers console, and the
   PocketBase admin credentials.
2. Import `pocketbase/schema.json` into your PocketBase instance:
   Admin UI → Settings → **Import collections** → paste the file
   contents → Review → Confirm. (Format matches PocketBase 0.22's
   import API — a bare array of collection objects with explicit
   `id`s; relation fields reference those same fixed IDs, e.g.
   `menu_categories.store` → `stores`'s id `fnbstores0000001`. If your
   instance is later upgraded to 0.23+, the schema needs converting to
   the newer `fields` format before re-importing.)
3. Seed at least one `stores` row, a few `menu_categories`, and
   `menu_items` for the pilot store.
4. In the LINE Developers console, set the webhook URL to
   `https://<your-domain>/api/line/webhook` on the customer-facing
   channel. For the LIFF app, set the **Endpoint URL to your domain
   root** (`https://<your-domain>/`) — NOT a specific page like
   `/liff/menu`. LIFF appends the requested path (via `liff.state`) on
   top of the Endpoint URL, so pointing the Endpoint URL at a subpath
   causes it to double up (`/liff/menu/liff/menu` → 404). Deep links
   like `https://liff.line.me/{liffId}/liff/menu` then resolve
   correctly against the root.
5. Run `npm run setup-rich-menu` to create and publish the Rich Menu
   (needs `STORE_LINE_CHANNEL_ACCESS_TOKEN` and `NEXT_PUBLIC_LIFF_ID`
   in `.env.local`). Re-run any time you edit `assets/rich-menu.png`
   or the tap areas in the script — it replaces the existing menu
   rather than stacking a new one.
6. `npm install @line/liff pocketbase` if not already present in the
   parent project.

## Deliberately out of scope for this first pass

- **Automated marketing / broadcast messages** — the doc's "automated
  marketing" piece (segmented broadcasts, campaigns) isn't built yet —
  flagged as a separate feature, not blocking ordering.
- **Points redemption at checkout** — customers earn points here;
  spending them against an order isn't wired up yet (`points_used` is
  in the schema but always 0 for now).
- **Multi-store routing in one deployment** — the webhook currently
  assumes one store per deployment via `LINE_STORE_ID`. If several
  restaurant locations share one Next.js deployment, the webhook needs
  to resolve the store from the LINE destination channel ID instead.

## Open question to confirm before more building

Section 4 of the feature doc asks whether to fork the resale-inventory
codebase or run this as a multi-tenant schema in one codebase — this
scaffold assumes the **multi-tenant** direction (a `store` relation on
every collection), since that's what the PocketBase schema reflects.
Worth locking that down before extending further.
