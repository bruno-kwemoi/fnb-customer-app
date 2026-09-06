import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { resolveStoreIdServer } from "@/lib/store";
import { resolveStaffIdentity } from "@/lib/staff-auth";
import type { OrderItem } from "@/types";

// GET /api/admin/reports?from=2026-09-01&to=2026-09-06
//
// Admin-only — deliberately stricter than the staff dashboard. The
// shared-device passcode (STAFF_ACCESS_CODE) is NOT accepted here,
// only LINE identity with role="admin": business figures shouldn't be
// visible to anyone who just knows the counter tablet's passcode, and
// the shared-device path has no role to check in the first place.
export async function GET(req: NextRequest) {
  const pb = await getAdminPocketBase();

  const staff = await resolveStaffIdentity(req, pb);
  if (!staff || staff.kind !== "line" || staff.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to (YYYY-MM-DD)" }, { status: 400 });
  }

  const storeId = await resolveStoreIdServer(pb);
  const rangeStart = `${from} 00:00:00`;
  const rangeEnd = `${to} 23:59:59`;
  const dateFilter = `store="${storeId}" && created >= "${rangeStart}" && created <= "${rangeEnd}"`;

  const [orders, statusLog] = await Promise.all([
    pb.collection("orders").getFullList({ filter: dateFilter, sort: "created" }),
    pb.collection("order_status_log").getFullList({ filter: dateFilter, sort: "created" }),
  ]);

  // Sales figures are scoped to non-cancelled orders — a cancelled
  // order isn't revenue, isn't real points issued, and shouldn't
  // count toward "what sold." Order-type split (dine-in/takeout) is
  // the one figure computed over ALL orders regardless of outcome,
  // since it's about demand pattern, not completed sales.
  const counted = orders.filter((o) => o.status !== "cancelled");

  const revenue = counted.reduce((sum, o) => sum + (o.subtotal ?? 0), 0);
  const pointsIssued = counted.reduce((sum, o) => sum + (o.points_earned ?? 0), 0);
  const uniqueCustomers = new Set(counted.map((o) => o.customer)).size;

  const statusBreakdown: Record<string, number> = {};
  for (const o of orders) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
  }

  const orderTypeBreakdown = { dine_in: 0, takeout: 0 };
  for (const o of orders) {
    if (o.order_type === "dine_in" || o.order_type === "takeout") {
      orderTypeBreakdown[o.order_type as "dine_in" | "takeout"] += 1;
    }
  }

  const itemCounts = new Map<string, number>();
  for (const o of counted) {
    const items = (o.items ?? []) as OrderItem[];
    for (const item of items) {
      itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
    }
  }
  const topItems = [...itemCounts.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const staffCounts = new Map<string, number>();
  for (const entry of statusLog) {
    const name = entry.staff_display_name || "共有端末";
    staffCounts.set(name, (staffCounts.get(name) ?? 0) + 1);
  }
  const staffActivity = [...staffCounts.entries()]
    .map(([displayName, count]) => ({ displayName, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    range: { from, to },
    revenue,
    orderCount: counted.length,
    cancelledCount: statusBreakdown["cancelled"] ?? 0,
    avgOrderValue: counted.length > 0 ? Math.round(revenue / counted.length) : 0,
    pointsIssued,
    uniqueCustomers,
    statusBreakdown,
    orderTypeBreakdown,
    topItems,
    staffActivity,
  });
}
