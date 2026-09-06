"use client";

import { useEffect, useState } from "react";
import { getLineIdToken, withTimeout } from "@/lib/liff";

// Admin-only reports — reuses the same staff LIFF app as
// /staff/liff/orders (admin is a role within `staffs`, not a separate
// access point; see README's "same OA" setup). Gating happens
// server-side in /api/admin/reports; this page just reflects a 401 as
// "not an admin" versus other failure modes.

interface ReportData {
  range: { from: string; to: string };
  revenue: number;
  orderCount: number;
  cancelledCount: number;
  avgOrderValue: number;
  pointsIssued: number;
  uniqueCustomers: number;
  statusBreakdown: Record<string, number>;
  orderTypeBreakdown: { dine_in: number; takeout: number };
  topItems: { name: string; quantity: number }[];
  staffActivity: { displayName: string; count: number }[];
}

type State =
  | { phase: "loading" }
  | { phase: "no_id_token" }
  | { phase: "forbidden" }
  | { phase: "error"; message: string }
  | { phase: "ready"; idToken: string; data: ReportData | null };

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toDateInput(d);
  });
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [fetching, setFetching] = useState(false);

  // Initial LIFF/ID-token setup — same pattern as /staff/liff/orders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;
        if (!liffId) throw new Error("NEXT_PUBLIC_STAFF_LIFF_ID is not set in this deployment's environment.");

        const idToken = await withTimeout(getLineIdToken(liffId), 10000, "LINE login");
        if (cancelled) return;

        if (!idToken) {
          setState({ phase: "no_id_token" });
          return;
        }

        setState({ phase: "ready", idToken, data: null });
      } catch (err) {
        if (cancelled) return;
        console.error("[staff/liff/reports] init failed", err);
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadReport(idToken: string) {
    setFetching(true);
    try {
      const res = await withTimeout(
        fetch(`/api/admin/reports?from=${from}&to=${to}`, { headers: { "x-staff-id-token": idToken } }),
        10000,
        "Report request"
      );
      if (res.status === 401) {
        setState({ phase: "forbidden" });
        return;
      }
      if (!res.ok) {
        setState({ phase: "error", message: `HTTP ${res.status}` });
        return;
      }
      const data: ReportData = await res.json();
      setState({ phase: "ready", idToken, data });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setFetching(false);
    }
  }

  // Auto-load once we have a token, and whenever the picked range
  // actually gets applied via the button below (not on every
  // keystroke while editing the date fields).
  useEffect(() => {
    if (state.phase === "ready" && state.data === null) {
      loadReport(state.idToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  if (state.phase === "loading") {
    return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
  }

  if (state.phase === "no_id_token") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">設定エラー</p>
        <p>ID tokenが取得できませんでした。LIFFアプリの「ID token」設定をご確認ください。</p>
      </div>
    );
  }

  if (state.phase === "forbidden") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">管理者権限が必要です</p>
        <p>レポートの閲覧には管理者ロールが必要です。管理者にお問い合わせください。</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">読み込みに失敗しました</p>
        <p className="text-xs text-neutral-400 font-mono break-all">{state.message}</p>
      </div>
    );
  }

  const data = state.data;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold mb-4">レポート</h1>

      <div className="flex items-end gap-2 mb-5">
        <div className="flex-1">
          <label className="text-xs text-neutral-500 block mb-1">開始日</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-neutral-500 block mb-1">終了日</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => loadReport(state.idToken)}
          disabled={fetching}
          className="rounded-lg bg-neutral-900 text-white text-sm font-bold px-4 py-2 disabled:opacity-50"
        >
          {fetching ? "…" : "表示"}
        </button>
      </div>

      {!data ? (
        <p className="text-sm text-neutral-400 text-center py-12">読み込み中…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <SummaryCard label="売上" value={`¥${data.revenue.toLocaleString()}`} />
            <SummaryCard label="注文数" value={`${data.orderCount}件`} />
            <SummaryCard label="平均注文額" value={`¥${data.avgOrderValue.toLocaleString()}`} />
            <SummaryCard label="付与ポイント" value={`${data.pointsIssued}pt`} />
            <SummaryCard label="利用客数" value={`${data.uniqueCustomers}人`} />
            <SummaryCard label="キャンセル" value={`${data.cancelledCount}件`} />
          </div>

          <div className="mb-5">
            <p className="text-xs text-neutral-500 mb-2">利用方法</p>
            <div className="flex gap-2 text-sm">
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                店内 {data.orderTypeBreakdown.dine_in}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                テイクアウト {data.orderTypeBreakdown.takeout}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <p className="text-xs text-neutral-500 mb-2">人気メニュー</p>
            {data.topItems.length === 0 ? (
              <p className="text-sm text-neutral-400">データがありません</p>
            ) : (
              <div className="flex flex-col gap-1">
                {data.topItems.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm py-1">
                    <span>
                      {i + 1}. {item.name}
                    </span>
                    <span className="text-neutral-500">{item.quantity}点</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-2">スタッフ対応件数</p>
            {data.staffActivity.length === 0 ? (
              <p className="text-sm text-neutral-400">データがありません</p>
            ) : (
              <div className="flex flex-col gap-1">
                {data.staffActivity.map((s) => (
                  <div key={s.displayName} className="flex items-center justify-between text-sm py-1">
                    <span>{s.displayName}</span>
                    <span className="text-neutral-500">{s.count}件</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
