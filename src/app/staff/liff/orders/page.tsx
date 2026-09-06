"use client";

import { useEffect, useMemo, useState } from "react";
import { getLineIdToken, getLineProfile } from "@/lib/liff";
import StaffOrdersDashboard from "@/components/staff/OrdersDashboard";

// Personal LINE entry point for staff/admin — opened from LINE (via
// the staff rich menu or a shared link), not a shared device. The
// LIFF ID token is verified against LINE server-side (see
// verifyLineIdToken in lib/line.ts) and matched against the `staff`
// PocketBase collection; unlike the customer flow, a client claiming
// a userId isn't enough here.
//
// Requires NEXT_PUBLIC_STAFF_LIFF_ID and a LIFF app in the LINE
// Developers Console with "ID token" enabled — see README.

type State =
  | { phase: "loading" }
  | { phase: "not_registered"; lineUserId: string; displayName: string }
  | { phase: "no_id_token" }
  | { phase: "error"; message: string }
  | { phase: "ready"; idToken: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms — see below for likely causes.`)), ms)
    ),
  ]);
}

export default function StaffLiffOrdersPage() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;
        if (!liffId) {
          throw new Error("NEXT_PUBLIC_STAFF_LIFF_ID is not set in this deployment's environment.");
        }

        // liff.init() can hang indefinitely rather than reject — e.g.
        // when opened outside LINE's in-app browser, or when
        // third-party storage is blocked mid-login-redirect. Without
        // this, that hang is indistinguishable from a slow network to
        // the person staring at a spinner forever.
        const [profile, idToken] = await withTimeout(
          Promise.all([getLineProfile(liffId), getLineIdToken(liffId)]),
          10000,
          "LINE login"
        );
        if (cancelled) return;

        if (!idToken) {
          setState({ phase: "no_id_token" });
          return;
        }

        // Check once up front so an unregistered person sees a useful
        // "here's your ID, ask your manager" screen instead of the
        // dashboard silently failing to load anything.
        const res = await withTimeout(
          fetch("/api/staff/orders?status=all", { headers: { "x-staff-id-token": idToken } }),
          10000,
          "Staff check request"
        );
        if (cancelled) return;

        if (res.status === 401) {
          setState({ phase: "not_registered", lineUserId: profile.userId, displayName: profile.displayName });
          return;
        }

        setState({ phase: "ready", idToken });
      } catch (err) {
        if (cancelled) return;
        console.error("[staff/liff/orders] init failed", err);
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authHeaders = useMemo<Record<string, string>>(
    () => (state.phase === "ready" ? { "x-staff-id-token": state.idToken } : ({} as Record<string, string>)),
    [state]
  );

  if (state.phase === "loading") {
    return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
  }

  if (state.phase === "error") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">読み込みに失敗しました</p>
        <ul className="list-disc pl-5 mb-3 space-y-1">
          <li>LINEアプリ内でこのリンクを開いていますか？（外部ブラウザでは動作しません）</li>
          <li>LIFFアプリのEndpoint URLはドメインのみ（パスなし）に設定されていますか？</li>
          <li>デプロイ後の環境変数（NEXT_PUBLIC_STAFF_LIFF_ID など）は最新のデプロイに反映されていますか？</li>
        </ul>
        <p className="text-xs text-neutral-400 font-mono break-all">{state.message}</p>
      </div>
    );
  }

  if (state.phase === "no_id_token") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">設定エラー</p>
        <p>
          このLINEアプリではID tokenが取得できませんでした。LINE Developers
          consoleでこのLIFFアプリの「ID token」設定がオンになっているか管理者にご確認ください。
        </p>
      </div>
    );
  }

  if (state.phase === "not_registered") {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">スタッフとして登録されていません</p>
        <p className="mb-4">下記のIDを管理者にお伝えください。登録後、再度お試しください。</p>
        <div className="rounded-lg bg-neutral-100 p-3 mb-2">
          <p className="text-xs text-neutral-400 mb-1">お名前</p>
          <p className="font-mono text-sm mb-2">{state.displayName}</p>
          <p className="text-xs text-neutral-400 mb-1">LINEユーザーID</p>
          <p className="font-mono text-xs break-all">{state.lineUserId}</p>
        </div>
      </div>
    );
  }

  return (
    <StaffOrdersDashboard
      authHeaders={authHeaders}
      onUnauthorized={() =>
        setState({ phase: "not_registered", lineUserId: "", displayName: "" })
      }
    />
  );
}
