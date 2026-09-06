import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { resolveStoreIdServer } from "@/lib/store";
import { resolveStaffIdentity } from "@/lib/staff-auth";
import type { OrderSummary } from "@/types";

const VALID_STATUSES = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

// GET /api/staff/orders?status=pending — lists this store's orders,
// newest first. `status` omitted or "all" returns everything.
export async function GET(req: NextRequest) {
  const pb = await getAdminPocketBase();

  const staff = await resolveStaffIdentity(req, pb);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  if (status && status !== "all" && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const storeId = await resolveStoreIdServer(pb);

    const filter =
      status && status !== "all" ? `store="${storeId}" && status="${status}"` : `store="${storeId}"`;

    // expand: "customer" pulls the related customer record in the same
    // request instead of N+1 queries per order.
    const records = await pb.collection("orders").getFullList({
      filter,
      sort: "-created",
      expand: "customer",
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
      customerName: o.expand?.customer?.display_name ?? "不明",
    }));

    return NextResponse.json({
      orders,
      staff: staff.kind === "line" ? { displayName: staff.displayName, role: staff.role } : null,
    });
  } catch (err) {
    console.error("[staff/orders] list failed", err);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
}
