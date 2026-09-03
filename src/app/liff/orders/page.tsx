"use client";

import { useEffect, useRef, useState } from "react";
import { getLineProfile } from "@/lib/liff";
import type { OrderSummary } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "受付中",
  confirmed: "確認済み",
  preparing: "調理中",
  ready: "準備完了",
  completed: "完了",
  cancelled: "キャンセル",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  completed: "bg-neutral-100 text-neutral-500",
  cancelled: "bg-red-100 text-red-700",
};

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const lineUserIdRef = useRef<string | null>(null);

  async function load() {
    if (!lineUserIdRef.current) {
      const profile = await getLineProfile();
      lineUserIdRef.current = profile.userId;
    }
    const res = await fetch(
      `/api/customer/orders?lineUserId=${encodeURIComponent(lineUserIdRef.current)}`
    );
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Poll while there's an order still in flight, so a status change
    // made from the staff dashboard shows up without a manual refresh.
    // Stops polling once nothing is active, to avoid pinging the API
    // forever from a screen the customer left open.
    const interval = setInterval(() => {
      setOrders((current) => {
        if (current.some((o) => ACTIVE_STATUSES.includes(o.status))) {
          load();
        }
        return current;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="p-4 pb-10">
      <h1 className="text-base font-bold mb-3">注文履歴</h1>

      {orders.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-12">まだご注文がありません</p>
      )}

      <div className="flex flex-col gap-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500">
                {new Date(o.created).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className={`text-xs font-bold rounded-full px-2.5 py-1 ${STATUS_COLOR[o.status]}`}
              >
                {STATUS_LABEL[o.status]}
              </span>
            </div>

            <div className="flex flex-col gap-1 mb-2">
              {o.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="text-neutral-500">
                    ¥{(item.unit_price * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-500">
              <span>
                {o.orderType === "dine_in" ? `店内・テーブル${o.tableNumber ?? ""}` : "テイクアウト"}
              </span>
              <span>
                合計 ¥{o.subtotal.toLocaleString()}（{o.pointsEarned}pt獲得）
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
