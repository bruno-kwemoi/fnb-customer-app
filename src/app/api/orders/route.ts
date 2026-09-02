import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { pushLineMessage } from "@/lib/line";
import type { OrderItem } from "@/types";

// Called from the LIFF cart screen on "注文を確定する" (confirm order).
// Points logic: 1pt per ¥100 spent, flat — adjust to the client's
// actual loyalty design once confirmed.
const POINTS_PER_YEN = 1 / 100;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lineUserId, displayName, pictureUrl, storeId, orderType, tableNumber, items } = body as {
    lineUserId: string;
    displayName?: string;
    pictureUrl?: string;
    storeId: string;
    orderType: "dine_in" | "takeout";
    tableNumber?: string;
    items: OrderItem[];
  };

  if (!lineUserId || !storeId || !items?.length) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  let pb;
  try {
    pb = await getAdminPocketBase();
  } catch (err) {
    console.error("[orders] admin auth failed", err);
    return NextResponse.json({ error: "server_auth_failed" }, { status: 500 });
  }

  let customer = await pb
    .collection("customers")
    .getFirstListItem(`line_user_id="${lineUserId}"`)
    .catch(() => null);

  if (!customer) {
    // Not every real customer arrives via the `follow` webhook event —
    // notably, anyone who friended the OA before this app's webhook
    // existed never fired that event, and never will (LINE doesn't
    // replay it). Rather than hard-blocking checkout on that, create
    // the customer record here using the LIFF profile the client
    // already has. The webhook's handleFollow() still fires the
    // welcome message + registers new friends going forward; this is
    // just the fallback for everyone it can't reach retroactively.
    if (!displayName) {
      return NextResponse.json(
        { error: "customer_creation_failed", detail: "missing LINE profile displayName" },
        { status: 400 }
      );
    }
    try {
      customer = await pb.collection("customers").create({
        line_user_id: lineUserId,
        display_name: displayName,
        picture_url: pictureUrl ?? "",
        store: storeId,
        loyalty_points: 0,
        loyalty_tier: "regular",
      });
    } catch (err) {
      console.error("[orders] inline customer creation failed", err);
      return NextResponse.json({ error: "customer_creation_failed" }, { status: 500 });
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const pointsEarned = Math.floor(subtotal * POINTS_PER_YEN);

  let order;
  try {
    order = await pb.collection("orders").create({
      store: storeId,
      customer: customer.id,
      status: "pending",
      order_type: orderType,
      table_number: tableNumber ?? "",
      items,
      subtotal,
      points_earned: pointsEarned,
      points_used: 0,
    });

    await pb.collection("customers").update(customer.id, {
      loyalty_points: customer.loyalty_points + pointsEarned,
    });
  } catch (err) {
    console.error("[orders] PocketBase write failed", err);
    return NextResponse.json({ error: "order_write_failed" }, { status: 500 });
  }

  // The order is already committed at this point — a LINE push failure
  // (expired/invalid channel token, rate limit, transient LINE API
  // error) must NOT be reported back to the customer as an order
  // failure, since that's a false negative: their order was placed.
  // Log it for follow-up instead of throwing.
  try {
    const store = await pb.collection("stores").getOne(storeId);
    const itemLines = items.map((i) => `・${i.name} x${i.quantity}`).join("\n");

    await pushLineMessage(store.line_channel_access_token, lineUserId, [
      {
        type: "text",
        text: `ご注文ありがとうございます！\n\n${itemLines}\n\n合計：¥${subtotal.toLocaleString()}\n獲得ポイント：${pointsEarned}pt\n\n${
          orderType === "dine_in" ? "スタッフがお席までお持ちします。" : "ご準備が整い次第ご案内します。"
        }`,
      },
    ]);
  } catch (err) {
    console.error(`[orders] confirmation push failed for order ${order.id}`, err);
  }

  return NextResponse.json({ ok: true, orderId: order.id, pointsEarned });
}
