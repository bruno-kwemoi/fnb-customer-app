# Customer-Facing LINE Ordering — F&B DX (Phase 1)

Real implementation of the **Customer-Facing LINE Account** side of the
[Feature Requirement] doc: guest ordering + loyalty, on the same stack
as `line-retail-tool` (Next.js App Router, LIFF, PocketBase).

Currently deployed standalone (Netlify + its own GitHub repo:
`bruno-kwemoi/fnb-customer-app`) rather than merged into the
`line-retail-tool` codebase — merge it in later if that's still the
plan; nothing here assumes one or the other.

## What's included

- **Menu browsing** (`/liff/menu`) — categories + items pulled from
  PocketBase, add-to-cart with a sticky cart bar.
- **Cart & checkout** (`/liff/cart`) — quantity editing, dine-in/takeout
  toggle, table number capture, order submission.
- **Loyalty** (`/liff/loyalty`) — points balance + tier display.
- **Root redirect** (`/`) — resolves LIFF's `liff.state` deep-link
  param and routes to the right page. Required by LIFF itself — see
  Architecture notes below.
- **Order API** (`/api/orders`) — writes the order, credits loyalty
  points (1pt / ¥100, adjust to the client's real program), pushes a
  LINE confirmation message.
- **Store API** (`/api/store`) — resolves the current store's id for
  the client, without exposing the admin-only `stores` collection.
- **Customer API** (`/api/customer`) — same pattern, for the loyalty
  screen's read of `customers`.
- **Webhook** (`/api/line/webhook`) — verifies LINE's signature,
  registers new followers as `customers` records, handles a `ポイント`
  keyword as a fallback outside the LIFF flow. Short-circuits on empty
  event lists (LINE's Verify-button ping) to avoid timing out.
- **PocketBase schema** (`pocketbase/schema.json`) — `stores`,
  `menu_categories`, `menu_items`, `customers`, `orders`.
- **Rich Menu** (`scripts/setup-rich-menu.mjs`, `assets/rich-menu.png`)
  — creates and registers the persistent two-button chat menu (注文する
  / ポイント確認) as the default for all followers.
- **Seed script** (`scripts/seed.mjs`) — idempotent; creates or
  updates one store + starter menu.
- **Debug script** (`scripts/debug-store.mjs`) — prints the actual
  stored `line_official_account_id` vs. what's in `.env.local`,
  char-code comparison included, for chasing mismatches directly
  instead of guessing.

## Architecture notes

**Which PocketBase collections are public vs. admin-only, and why:**
`stores` holds the LINE channel secret and access token — never
public. `customers` holds real names and LINE user IDs — never
public. `orders` — never public. `menu_categories` and `menu_items`
hold nothing sensitive and customers need to browse them with no
login, so those two are public (List/View rules set to empty/no
restriction).

Because `stores` and `customers` stay locked, the client can't query
them directly — that's what `/api/store` and `/api/customer` are for:
thin server routes that authenticate as PocketBase admin and return
only the safe fields. If a future feature needs client-side access to
another admin-only collection, follow this same pattern rather than
opening that collection's rules.

**Store resolution:** the app looks up its `stores` record by
`LINE_OA_ID` (your stable `@botid`) rather than a PocketBase-generated
record ID, so nothing needs copying into env vars after seeding.
`resolveStoreId()` (client, via `/api/store`) and
`resolveStoreIdServer()` (server, e.g. the webhook) both do this
lookup — see `src/lib/store.ts`.

**LIFF's Endpoint URL must be your domain root**, not a specific page.
LIFF appends the requested deep-link path (`liff.state`) on top of
whatever Endpoint URL is configured — pointing it at a subpath causes
that path to double up and 404. `src/app/page.tsx` is what actually
resolves `liff.state` and redirects onward; it needs to exist at `/`
for this to work at all.

## Setup

1. Copy `.env.local.example` → `.env.local` and fill it in. Read the
   comments in that file — a couple of vars (`NEXT_PUBLIC_LINE_OA_ID`)
   are only for the debug script, not the running app.
2. Import `pocketbase/schema.json` into your PocketBase instance:
   Admin UI → Settings → **Import collections** → paste the file
   contents → Review → Confirm. (Format matches PocketBase 0.22's
   import API. If your instance is later upgraded to 0.23+, convert to
   the newer `fields` format before re-importing.)
3. **Set API rules on `menu_categories` and `menu_items`** — this step
   is not covered by the schema import if those collections already
   existed before you imported this schema (PocketBase import doesn't
   retroactively update rules on existing collections). In the Admin
   UI, open each collection's settings and set both List rule and View
   rule to empty (public). Leave `stores`, `customers`, and `orders`
   as admin-only.
4. Run `npm install`, then `npm run seed` to create the store + starter
   menu (safe to re-run — matches by name and updates in place rather
   than duplicating).
5. In the LINE Developers console: set the webhook URL to
   `https://<your-domain>/api/line/webhook` (the full path — a common
   mistake is pointing it at just `/webhook` or the domain root). Set
   the LIFF app's Endpoint URL to your domain root (`https://<your-domain>/`).
6. Run `npm run setup-rich-menu` to create and publish the Rich Menu.
   Re-run any time you edit `assets/rich-menu.png` or the tap areas in
   the script — it replaces the existing menu rather than stacking a
   new one.
7. If deploying (e.g. Netlify): set every var from `.env.local` in the
   host's environment variable settings too. Adding/changing them
   after a build won't take effect until the next deploy — trigger one
   manually if needed.

## Deliberately out of scope for this pass

- **Automated marketing / broadcast messages** — the doc's "automated
  marketing" piece (segmented broadcasts, campaigns) isn't built yet —
  flagged as a separate feature, not blocking ordering.
- **Points redemption at checkout** — customers earn points here;
  spending them against an order isn't wired up yet (`points_used` is
  in the schema but always 0 for now).
- **Multi-store routing in one deployment** — `LINE_OA_ID` resolves a
  single fixed store per deployment. Several restaurant locations
  sharing one deployment would need per-request resolution from the
  webhook payload's `destination` field instead — see the comment in
  `src/app/api/line/webhook/route.ts`.
- **LIFF session verification on `/api/customer`** — it trusts the
  `lineUserId` the client sends rather than verifying it against the
  LIFF ID token server-side. Fine for a pilot; worth hardening (via
  `liff.getIDToken()` + LINE's token verify endpoint) before wider
  rollout.

## Open question to confirm before more building

Section 4 of the feature doc asks whether to fork the resale-inventory
codebase or run this as a multi-tenant schema in one codebase — this
scaffold assumes the **multi-tenant** direction (a `store` relation on
every collection), since that's what the PocketBase schema reflects.
Worth locking that down before extending further, especially since
it's now deployed as its own standalone repo rather than merged in.
