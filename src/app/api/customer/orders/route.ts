import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import type { OrderSummary } from "@/types";

// `orders` stays admin-only in PocketBase, same reasoning as `customers`
// and `stores` — see README Architecture notes. This route looks up the
// order history for a given LINE user server-side and returns only the
// fields the tracking screen needs.
//
// Same trust caveat as /api/customer: the lineUserId is taken as given
// from the client rather than verified against the LIFF session. Fine
// for a pilot; harden with liff.getIDToken() before wider rollout.
export async function GET(req: NextRequest) {
  const lineUserId = req.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
  }

  try {
    const pb = await getAdminPocketBase();
    const customer = await pb
      .collection("customers")
      .getFirstListItem(`line_user_id="${lineUserId}"`);

    const records = await pb.collection("orders").getFullList({
      filter: `customer="${customer.id}"`,
      sort: "-created",
    });

    const orders: OrderSummary[] = records.map((o) => ({
      id: o.id,
      status: o.status,
      orderType: o.order_type,
      tableNumber: o.table_number || undefined,
      items: o.items,
      subtotal: o.subtotal,
      pointsEarned: o.points_earned,
      created: o.created,
    }));

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("[customer/orders] lookup failed", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 404 });
  }
}
