import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { verifyStaffCode } from "@/lib/staff-auth";
import { pushLineMessage } from "@/lib/line";

const VALID_STATUSES = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

// Customer-facing copy for each status, sent as a LINE push right
// after a staff member advances an order. No message for "pending" —
// that's the state an order starts in, nothing to notify about yet.
const STATUS_MESSAGES: Record<string, string> = {
  confirmed: "ご注文を確認しました。準備を始めます。",
  preparing: "只今調理中です。今しばらくお待ちください。",
  ready: "ご注文の準備ができました！",
  completed: "ご利用ありがとうございました。またのご来店をお待ちしております。",
  cancelled: "申し訳ございません。ご注文がキャンセルされました。詳しくは店舗スタッフまでお問い合わせください。",
};

// PATCH /api/staff/orders/:id  { status: "confirmed" }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyStaffCode(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { status } = body as { status?: string };

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const pb = await getAdminPocketBase();

  let updated;
  try {
    updated = await pb.collection("orders").update(params.id, { status });
  } catch (err) {
    console.error(`[staff/orders/${params.id}] status update failed`, err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // The status change is already committed at this point — a LINE
  // push failure (expired token, rate limit, transient error) must
  // never be reported back to staff as a failed status update, since
  // the update itself succeeded. Same non-blocking pattern as the
  // order-confirmation push in /api/orders.
  try {
    const message = STATUS_MESSAGES[status];
    if (message) {
      const [customer, store] = await Promise.all([
        pb.collection("customers").getOne(updated.customer),
        pb.collection("stores").getOne(updated.store),
      ]);
      if (customer?.line_user_id && store?.line_channel_access_token) {
        await pushLineMessage(store.line_channel_access_token, customer.line_user_id, [
          { type: "text", text: message },
        ]);
      }
    }
  } catch (err) {
    console.error(`[staff/orders/${params.id}] status-change notify failed`, err);
  }

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
