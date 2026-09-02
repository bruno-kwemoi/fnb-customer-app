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
  const { lineUserId, storeId, orderType, tableNumber, items } = body as {
    lineUserId: string;
    storeId: string;
    orderType: "dine_in" | "takeout";
    tableNumber?: string;
    items: OrderItem[];
  };

  if (!lineUserId || !storeId || !items?.length) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const pb = await getAdminPocketBase();

  const customer = await pb
    .collection("customers")
    .getFirstListItem(`line_user_id="${lineUserId}"`)
    .catch(() => null);

  if (!customer) {
    return NextResponse.json({ error: "customer not found — must follow LINE OA first" }, { status: 404 });
  }

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const pointsEarned = Math.floor(subtotal * POINTS_PER_YEN);

  const order = await pb.collection("orders").create({
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

  return NextResponse.json({ ok: true, orderId: order.id, pointsEarned });
}
