"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderSummary } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "未確認",
  confirmed: "確認済み",
  preparing: "調理中",
  ready: "受渡し待ち",
  completed: "完了",
  cancelled: "キャンセル",
};

// What tapping the primary action button does for each status —
// null means there's no further forward step (terminal states).
const NEXT_STATUS: Record<string, string | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

const POLL_INTERVAL_MS = 6000;

interface Props {
  /** Headers identifying the caller — either { "x-staff-code": ... }
   *  (shared device) or { "x-staff-id-token": ... } (LINE identity).
   *  Passed as a plain object rather than baked in here, since the
   *  two auth methods live in two different pages. */
  authHeaders: Record<string, string>;
  /** Called on a 401 — the two callers handle this differently
   *  (tablet: drop back to the passcode screen; LINE: show the
   *  "not registered" screen). */
  onUnauthorized: () => void;
}

export default function StaffOrdersDashboard({ authHeaders, onUnauthorized }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [staffLabel, setStaffLabel] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [includeDone, setIncludeDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // /api/staff/orders only accepts a single status value (or "all")
    // — fetch "all" and filter client-side rather than adding
    // multi-status query-param support for a single-store dashboard.
    const res = await fetch("/api/staff/orders?status=all", { headers: authHeaders });
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    const all: OrderSummary[] = data.orders;
    setOrders(includeDone ? all : all.filter((o) => o.status !== "completed" && o.status !== "cancelled"));
    if (data.staff?.displayName) setStaffLabel(data.staff.displayName);
    if (data.staff?.role) setStaffRole(data.staff.role);
    setLoading(false);
  }, [authHeaders, includeDone, onUnauthorized]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function setStatus(order: OrderSummary, status: string) {
    setUpdatingId(order.id);
    try {
      const res = await fetch(`/api/staff/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (res.ok) await load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold">注文管理</h1>
          {staffLabel && <p className="text-xs text-neutral-500">ログイン中：{staffLabel}</p>}
        </div>
        <div className="flex items-center gap-3">
          {staffRole === "admin" && (
            <button
              onClick={() => router.push("/staff/liff/reports")}
              className="text-xs font-bold text-neutral-600 underline"
            >
              レポート
            </button>
          )}
          {staffLabel && (
            // A plain internal route (router.push) would NOT correctly
            // switch LIFF context here — LIFF only supports one active
            // app session per browser tab, and this page is already
            // running inside the STAFF LIFF app's session. This has to
            // be a real navigation to the customer LIFF app's own
            // liff.line.me link so LINE (or the root redirect handler)
            // re-initializes as that app instead.
            <a
              href={`https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/liff/menu`}
              className="text-xs font-bold text-neutral-600 underline"
            >
              お客様として注文する
            </a>
          )}
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
            完了/キャンセルも表示
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {orders.map((o) => {
          const next = NEXT_STATUS[o.status];
          const isTerminal = o.status === "completed" || o.status === "cancelled";
          return (
            <div key={o.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-100">
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(o.created).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="text-sm font-semibold mb-1">
                {o.orderType === "dine_in" ? `店内・テーブル${o.tableNumber ?? ""}` : "テイクアウト"}
                <span className="text-neutral-400 font-normal"> ・ {o.customerName}</span>
              </div>
              <ul className="text-sm text-neutral-700 mb-2">
                {o.items.map((it, i) => (
                  <li key={i}>
                    ・{it.name} x{it.quantity}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">¥{o.subtotal.toLocaleString()}</span>
                {!isTerminal && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatus(o, "cancelled")}
                      disabled={updatingId === o.id}
                      className="text-xs font-bold px-3 py-2 rounded-lg border border-red-300 text-red-600 disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                    {next && (
                      <button
                        onClick={() => setStatus(o, next)}
                        disabled={updatingId === o.id}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-neutral-900 text-white disabled:opacity-50"
                      >
                        {updatingId === o.id ? "更新中…" : `${STATUS_LABEL[next]}にする`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {orders.length === 0 && <p className="text-sm text-neutral-400 text-center py-12">対象の注文はありません</p>}
      </div>
    </div>
  );
}
