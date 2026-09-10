# F&B DX — Customer & Staff LINE App

A Next.js + PocketBase + LINE LIFF app for a food & beverage business:
customers order and track orders and loyalty points from inside LINE;
staff manage the order queue and (for admins) view sales/activity
reports, either from a shared counter device or their own phone via
LINE.

Deployed standalone (Netlify + its own GitHub repo:
`bruno-kwemoi/fnb-customer-app`), on the same general stack as
`line-retail-tool` (Next.js App Router, LIFF, PocketBase) but not
merged into that codebase — see "Open question" at the bottom.

---

## 1. Who uses what

| Role | Entry point | Auth |
|---|---|---|
| Customer | LINE Rich Menu → `/liff/menu`, `/liff/orders`, `/liff/loyalty` | LIFF profile (`lineUserId`), not cryptographically verified — see §6 |
| Staff (shared device) | `/staff/orders`, opened in a plain browser (e.g. a counter tablet) | One shared passcode (`STAFF_ACCESS_CODE`), no per-person identity |
| Staff (personal) | Staff Rich Menu (2 panels) → `/staff/liff/orders` | LIFF ID token, verified against LINE server-side, matched to a `staffs` record |
| Admin | Admin Rich Menu (3 panels — adds レポート) → `/staff/liff/orders` or `/staff/liff/reports` | Same LIFF ID-token verification, plus `role: "admin"` on the `staffs` record |

Customers and staff can be **the same LINE account** — nothing links
or blocks one role based on the other; see §6.

---

## 2. Feature reference

### Customer-facing

- **Menu browsing** (`/liff/menu`) — categories + items from
  PocketBase, add-to-cart with a sticky cart bar.
- **Cart & checkout** (`/liff/cart`) — quantity editing, dine-in/takeout
  toggle, table number capture, order submission. On success, links to
  order tracking.
- **Loyalty** (`/liff/loyalty`) — points balance + tier display.
- **Order tracking** (`/liff/orders`) — the customer's own order
  history + live status. Polls `/api/customer/orders` every 8s while
  anything shown is still active (pending/confirmed/preparing/ready).

### Staff-facing (shared UI, two entry points — see §1)

Both entry points render the same `OrdersDashboard` component and hit
the same `/api/staff/orders*` endpoints (`src/lib/staff-auth.ts`
resolves whichever auth method was used). Both list orders
oldest-active-first with one-tap status advance (pending → confirmed →
preparing → ready → completed) and cancel, polling every 6s.

Advancing a status:
- Pushes a LINE message to the customer (`STATUS_MESSAGES` in
  `/api/staff/orders/[id]/route.ts`) — non-blocking; a push failure
  never fails the status update itself.
- Writes a row to `order_status_log` (who, from what status, to what
  status, when) — non-blocking, feeds the admin activity report.

### Admin-facing

- **Reports** (`/staff/liff/reports`) — sales (revenue, order count,
  avg order value, points issued, unique customers, top items,
  dine-in/takeout split) and staff activity (status-change counts per
  person), over a date range you pick each time (no smart default).
  Gated by `role: "admin"` — the shared-device passcode is **not**
  accepted here at all (see `/api/admin/reports/route.ts`); business
  figures shouldn't be reachable by anyone who just knows the counter
  passcode. The "レポート" link in the dashboard header only renders
  for admins, and the API 401s regardless of whether you found the
  URL directly.

---

## 3. Data model

All collections live in one PocketBase instance, scoped by a `store`
relation (see §5 on multi-store). `pocketbase/schema.json` is the
source of truth — import it rather than hand-creating collections.

| Collection | Purpose | Public? |
|---|---|---|
| `stores` | LINE channel secret/token, one row per store | **Admin-only** — never expose |
| `menu_categories` | Menu section names, sort order | Public (List/View) |
| `menu_items` | Individual dishes, price, category | Public (List/View) |
| `customers` | Real name, LINE user ID, loyalty points | **Admin-only** |
| `orders` | Cart contents, status, points earned/used | **Admin-only** |
| `staffs` | LINE user ID, display name, role (`staff`/`admin`), store, active flag | **Admin-only** |
| `order_status_log` | Audit trail: who changed an order's status, from what, to what, when | **Admin-only** |

Because `stores`/`customers`/`orders`/`staffs`/`order_status_log` stay
locked, the client never queries them directly — every read/write goes
through a server route authenticated as PocketBase admin
(`getAdminPocketBase()` in `src/lib/pocketbase.ts`). If a future
feature needs client access to another admin-only collection, follow
this same thin-server-route pattern rather than opening that
collection's rules.

**A known PocketBase 0.22.x quirk:** a `required` number field rejects
the literal value `0`, treating it as if it were empty — even with
`min: 0` already enforcing non-negativity. Every number field that can
legitimately be `0` in normal use (`loyalty_points`, `points_used`,
`points_earned`, `subtotal`, `price`, `sort_order`) is set
`required: false` in the schema specifically because of this. If you
add a new number field, ask whether `0` is a valid value before
marking it required.

---

## 4. API reference

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/store` | GET | none (public data only) | Resolve the current store's ID for the client |
| `/api/customer` | GET | trusts client-sent `lineUserId` (§6) | Loyalty screen data |
| `/api/customer/orders` | GET | trusts client-sent `lineUserId` (§6) | Customer's own order history |
| `/api/orders` | POST | trusts client-sent `lineUserId` (§6) | Place an order; self-heals a missing `customers` record; credits points; pushes LINE confirmation |
| `/api/staff/orders` | GET | shared passcode **or** verified LINE identity | List orders for the store |
| `/api/staff/orders/[id]` | PATCH | shared passcode **or** verified LINE identity | Change an order's status; pushes LINE update; writes audit log |
| `/api/admin/reports` | GET | verified LINE identity **with `role: "admin"` only** | Sales + staff activity aggregates |
| `/api/line/webhook` | POST | LINE signature verification | Registers new followers as customers (skips anyone already in `staffs`); handles a `ポイント` keyword fallback |

---

## 5. Architecture notes

**Store resolution:** the app looks up its `stores` record by
`LINE_OA_ID` (your stable `@botid`) rather than a PocketBase-generated
record ID, so nothing needs copying into env vars after seeding.
`resolveStoreId()` (client, via `/api/store`) and
`resolveStoreIdServer()` (server) both do this — see `src/lib/store.ts`.
Currently **one store per deployment** — see §9 for what multi-store
would need.

**LIFF's Endpoint URL must be your domain root**, not a specific page,
for *both* LIFF apps (customer and staff). LIFF appends the requested
deep-link path on top of whatever Endpoint URL is configured —
pointing it at a subpath causes the path to double up and 404.

**`liff.state` and the root redirect (`src/app/page.tsx`):** when a
LIFF link is opened outside LINE's in-app browser (a plain browser, an
external QR scanner), LINE can't preserve the full path through its
login redirect — it lands back on the bare Endpoint URL with the
intended path in a `liff.state` query param instead, and it's the
app's job to read that and route accordingly. The root page does this
— **and critically, picks which LIFF ID to call `liff.init()` with
based on the target path** (`/staff/...` → staff LIFF ID, everything
else → customer LIFF ID) **before** initializing. Calling `liff.init()`
with the wrong LIFF ID here doesn't cleanly fail — the login handshake
just doesn't complete, which looks from the outside exactly like a
page stuck loading forever. If you add a third LIFF app, this
selection logic needs to grow with it.

**Staff auth, unified (`src/lib/staff-auth.ts`):**
`resolveStaffIdentity()` accepts either the shared passcode
(`x-staff-code` header) or a LIFF ID token (`x-staff-id-token`
header), verified against LINE via `verifyLineIdToken()` in
`src/lib/line.ts` and matched against `staffs`. Reports
(`/api/admin/reports`) additionally require the resolved identity to
be `kind: "line"` with `role: "admin"` — the shared-device path has no
per-person role to check, so it's excluded entirely rather than
treated as some default role.

**Rich Menus:** three independent Rich Menus exist on the same LINE
channel — customer (`assets/rich-menu.png`, account default,
`scripts/setup-rich-menu.mjs`), staff (`assets/staff-rich-menu.png`,
2 panels: orders + switch to customer), and admin
(`assets/admin-rich-menu.png`, 3 panels: orders + reports + switch to
customer). The latter two are created together by
`scripts/setup-staff-rich-menu.mjs` and linked per-person by
`scripts/add-staff.mjs`, which picks the right one based on the role
you pass it — neither is ever account-default, so a customer never
sees either regardless of role. Each setup script only deletes rich
menus **matching its own name(s)** before recreating — an earlier
version of the customer script deleted *all* rich menus on the
channel, which would have wiped out the staff ones every time either
script ran; fixed, but worth knowing if you add a fourth menu.

---

## 6. Known trust boundaries (read before expanding access)

- **`/api/customer`, `/api/customer/orders`, `/api/orders`** all trust
  whatever `lineUserId` the client sends — not verified against a LIFF
  ID token. Fine for a pilot; before wider rollout, verify server-side
  the same way the staff flow already does (`liff.getIDToken()` +
  `verifyLineIdToken()`).
- **The staff flow is deliberately stricter** — LIFF ID tokens are
  verified against LINE directly, because staff actions change real
  order state and (for admins) expose business figures. Don't
  downgrade this to match the customer flow's convenience; if
  anything, the customer flow should eventually be upgraded to match
  this.
- **One LINE account can be both a customer and staff/admin** — the
  two roles are checked against two entirely separate collections
  (`customers`, `staffs`) with no cross-reference. Ordering as a
  customer never affects staff status and vice versa. LINE only shows
  one Rich Menu per account at a time, so switching between roles
  works two ways, layered on top of each other:
  - **Rich Menu panels** — the staff and admin Rich Menus each include
    an "お客様として注文する" panel (see §5), and the admin menu adds
    a "レポート" panel. One tap, no typing.
  - **Chat keywords** — handled in `handleTextMessage()`
    (`api/line/webhook/route.ts`), all following the same pattern:
    if eligible, get the relevant link back as a message; if not,
    **nothing happens at all** — no reply, no error, no hint the
    keyword does anything. This was a deliberate choice over a visible
    link (even one gated by a friendly "not registered" screen) to
    keep these fully invisible to anyone not eligible, rather than
    just safely inert.
    | Keyword | Who gets a reply | Links to |
    |---|---|---|
    | 「スタッフ」/ "staff" | Active staff (any role) | Order dashboard |
    | 「管理者」/ "admin" | Active staff with `role: "admin"` | Reports |
    | 「お客様」/ "customer" | Anyone, no check | Customer ordering |
  - **The in-dashboard "お客様として注文する" link** (header of
    `OrdersDashboard.tsx`, LINE identity sessions only) predates the
    Rich Menu panel and chat keyword — kept as a third way to reach
    the same place since it's zero incremental cost once built.

  All of these that cross between the staff and customer LIFF apps do
  a **real navigation** to the target app's own `liff.line.me` link,
  never an internal route — LIFF only supports one active app session
  per browser tab, so an internal route wouldn't actually switch
  context.

---

## 7. Setup

1. Copy `.env.local.example` → `.env.local` and fill it in — every var
   is commented with what it's for and where to find it.
2. Import `pocketbase/schema.json`: Admin UI → Settings → **Import
   collections** → paste file contents → Review → Confirm. (Format
   matches PocketBase 0.22's import API; convert to the newer `fields`
   format first if your instance is on 0.23+.)
3. **Uncheck "Required" on the number fields listed in §3** if they
   ended up required anyway (schema import should already set this
   correctly, but if a field pre-existed with a different setting,
   import doesn't retroactively fix it — see the merge-rules caveat in
   step 4).
4. **Set List/View rules to public on `menu_categories` and
   `menu_items`** if either already existed before this schema was
   imported — PocketBase import doesn't retroactively update rules on
   existing collections. Leave every other collection admin-only.
5. **Set `STAFF_ACCESS_CODE`** in `.env.local` — the shared-device
   dashboard rejects every request if this is unset.
6. `npm install`, then `npm run seed` (idempotent — safe to re-run).
7. LINE Developers console: webhook URL →
   `https://<your-domain>/api/line/webhook` (the full path — pointing
   it at just `/webhook` or the bare domain is a common mistake).
   Customer LIFF app's Endpoint URL → your domain root.
8. `npm run setup-rich-menu` to publish the customer Rich Menu. Re-run
   after editing `assets/rich-menu.png` or the tap areas in the script
   — it replaces rather than stacks.
9. If deploying (e.g. Netlify): mirror every `.env.local` var into the
   host's environment variable settings. **`NEXT_PUBLIC_*` vars are
   baked in at build time** — adding or changing one after a build has
   already happened does nothing until the next deploy. This has been
   the actual root cause of several "it's still broken" moments during
   this project — check the Deploys tab shows a *successful* build
   *after* the env var change, not just "triggered."

### Setup: staff/admin LINE access (optional, on top of the above)

The shared-passcode dashboard works without any of this — only needed
for personal LINE-based staff/admin access. Assumes the **same LINE
OA** as customers (see §6 for the trade-off vs. a separate OA).

1. Same LINE channel as the customer LIFF app → add a **second LIFF
   app**. Endpoint URL → your domain root (not `/staff/liff/orders` —
   see §5). Turn **ID token: ON** and confirm the **`openid` scope**
   is included — without both, `liff.getIDToken()` returns null and
   staff can never be verified.
2. Copy that LIFF app's ID into `NEXT_PUBLIC_STAFF_LIFF_ID`, and the
   channel's numeric **Channel ID** (Basic settings tab) into
   `LINE_CHANNEL_ID`.
3. `npm run setup-staff-rich-menu` — creates **both** the staff and
   admin Rich Menus in one run. Copy the two printed IDs into
   `STAFF_RICH_MENU_ID` and `ADMIN_RICH_MENU_ID`.
4. Have each staff member open the staff LIFF link once — unregistered,
   they land on a screen showing their name and LINE userId to send
   you (solves the chicken-and-egg problem of needing their ID before
   you can register them).
5. `npm run add-staff -- <lineUserId> "<display name>" [staff|admin]`
   for each of them.

Re-importing `pocketbase/schema.json` after this section was added is
a plain create (new `staffs`/`order_status_log` collections), not a
merge — the "field type cannot be changed" error only applies to
*editing* a field on a collection that already exists.

---

## 8. Troubleshooting (lessons already paid for once — don't re-learn them)

- **Generic-looking failure, no obvious cause** → check the actual
  response body and Netlify function logs before guessing. Several
  routes intentionally return a specific `error` code
  (`customer_creation_failed`, `order_write_failed`, `invalid_status`,
  etc.) precisely so this is diagnosable without re-reading source.
- **A page hangs on "loading" forever, no error at all** → this is
  almost never a slow network. It means something (usually
  `liff.init()`) is neither resolving nor rejecting. `/`,
  `/staff/liff/orders`, and `/staff/liff/reports` all wrap LIFF calls
  in `withTimeout()` (`src/lib/liff.ts`) specifically so this surfaces
  as a real, readable error within 10s instead of an infinite spinner
  — if you add a new LIFF-dependent page, use the same wrapper.
- **Netlify build fails on a TypeScript error involving a ternary that
  returns `{}` in one branch** → TypeScript sometimes unifies both
  branches' shapes instead of checking each against the target type
  independently, inferring the empty-object branch as having the
  sibling's key as `optional: undefined` rather than truly empty. Cast
  explicitly: `... : ({} as Record<string, string>)`, don't rely on an
  outer type annotation alone to fix it.
- **A deploy "succeeds" per Netlify but nothing you just changed seems
  live** → confirm it was actually a **successful build**, not a
  failed one silently leaving the previous build serving. This
  happened repeatedly during staff-auth development — a TypeScript
  error blocked several deploys in a row while testing continued
  against the stale previous version.
- **PocketBase rejects an import with "Field type cannot be changed"**
  → means a same-named collection already exists with an incompatible
  shape. Don't fight the merge — check whether it's actually in use
  (any real rows?) and if not, delete it and import fresh instead of
  trying to reconcile field-by-field.

---

## 9. Deliberately out of scope for this pass

- **Automated marketing / broadcast messages** — segmented broadcasts,
  campaigns — not built, flagged as a separate feature.
- **Points redemption at checkout** — customers earn points; spending
  them against an order isn't wired up (`points_used` exists in the
  schema, always `0` for now).
- **Multi-store routing in one deployment** — `LINE_OA_ID` resolves a
  single fixed store per deployment. Multiple locations sharing one
  deployment would need per-request resolution from the webhook
  payload's `destination` field instead — see the comment in
  `src/app/api/line/webhook/route.ts`.
- **Customer-flow ID verification** — see §6.
- **Staff management UI** — adding, deactivating, or changing a role
  is `npm run add-staff` from a terminal; deactivating specifically
  means manually flipping `active` off in the PocketBase Admin UI (the
  script only creates/updates). Fine for a small, slow-changing
  roster; wants a real UI before it's someone non-technical's job.
- **Rich menu ID rotation on re-run** — `npm run setup-staff-rich-menu`
  deletes and recreates **both** the staff and admin Rich Menus,
  changing both IDs every time. Everyone already registered under
  either one silently falls back to the customer menu until you update
  both env vars and re-run `add-staff` for each of them — including
  anyone on the admin menu, even if only the staff one logically
  changed, since the script always does both together.
- **Realtime order updates** — both dashboards poll (6s staff / 8s
  customer) rather than using PocketBase's realtime subscriptions. The
  `orders` collection is intentionally admin-only, so an anonymous
  browser client can't subscribe directly — realtime would need a real
  staff-auth-aware subscription path.

## Open question to confirm before more building

Whether to fork the resale-inventory codebase or run this as a
multi-tenant schema in one codebase — this scaffold assumes
**multi-tenant** (a `store` relation on every collection), matching
the PocketBase schema. Worth locking down before extending further,
especially now that it's deployed as its own standalone repo rather
than merged into `line-retail-tool`.
