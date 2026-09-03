"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderSummary } from "@/types";

// Staff auth here is a single shared code (see src/lib/staff-auth.ts),
// not a real login — it's kept in sessionStorage (not localStorage) so
// a shared/kiosk tablet doesn't stay signed in indefinitely across
// browser restarts, and sent as the x-staff-code header on every call.
const CODE_STORAGE_KEY = "staff_code";

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

export default function StaffOrdersPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [includeDone, setIncludeDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(CODE_STORAGE_KEY);
    if (saved) setCode(saved);
    else setLoading(false);
  }, []);

  // /api/staff/orders only accepts a single status value (or "all") —
  // fetch "all" and filter client-side rather than adding multi-status
  // query-param support for a single-store pilot dashboard.
  const load = useCallback(
    async (activeCode: string) => {
      const res = await fetch("/api/staff/orders?status=all", {
        headers: { "x-staff-code": activeCode },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(CODE_STORAGE_KEY);
        setCode(null);
        setAuthError("コードが正しくありません。");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const all: OrderSummary[] = data.orders;
      setOrders(includeDone ? all : all.filter((o) => o.status !== "completed" && o.status !== "cancelled"));
      setLoading(false);
    },
    [includeDone]
  );

  useEffect(() => {
    if (!code) return;
    load(code);
    const interval = setInterval(() => load(code), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [code, load]);

  async function submitCode() {
    setAuthError("");
    setLoading(true);
    const res = await fetch("/api/staff/orders?status=all", {
      headers: { "x-staff-code": codeInput },
    });
    if (res.status === 401) {
      setAuthError("コードが正しくありません。");
      setLoading(false);
      return;
    }
    sessionStorage.setItem(CODE_STORAGE_KEY, codeInput);
    setCode(codeInput);
  }

  async function setStatus(order: OrderSummary, status: string) {
    if (!code) return;
    setUpdatingId(order.id);
    try {
      const res = await fetch(`/api/staff/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-staff-code": code },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load(code);
    } finally {
      setUpdatingId(null);
    }
  }

  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <h1 className="text-lg font-bold mb-4 text-center">スタッフ用ログイン</h1>
          <input
            type="password"
            inputMode="numeric"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
            placeholder="アクセスコード"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm mb-2"
            autoFocus
          />
          {authError && <p className="text-xs text-red-600 mb-2">{authError}</p>}
          <button
            onClick={submitCode}
            disabled={!codeInput || loading}
            className="w-full rounded-xl bg-neutral-900 disabled:opacity-50 text-white text-sm font-bold py-3"
          >
            {loading ? "確認中…" : "ログイン"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">注文管理</h1>
        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          完了/キャンセルも表示
        </label>
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
