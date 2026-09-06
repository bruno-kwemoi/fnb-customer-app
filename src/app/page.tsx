"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { initLiff, withTimeout } from "@/lib/liff";

// This is what BOTH LIFF apps' Endpoint URL points at (the domain
// root) — see README. LIFF redirects here with the originally-
// requested path in the `liff.state` query param whenever it goes
// through the external-browser login flow (opened outside LINE's
// in-app browser) — e.g. opening https://liff.line.me/{liffId}/liff/menu
// this way lands here with ?liff.state=%2Fliff%2Fmenu — and it's on
// us to read that and route to the right page.
//
// Critical: liff.init() must be called with the SAME liffId whose
// login flow is completing here, or the handshake doesn't finish and
// LIFF either fails silently or starts another login redirect (which
// looks, from the outside, exactly like a page stuck on "loading").
// That means the liffId has to be chosen from the target path BEFORE
// calling initLiff — customer paths get NEXT_PUBLIC_LIFF_ID, /staff/
// paths get NEXT_PUBLIC_STAFF_LIFF_ID.
function LiffRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = searchParams.get("liff.state");
        const target = state && state.startsWith("/") ? state : "/liff/menu";
        const liffId = target.startsWith("/staff/")
          ? process.env.NEXT_PUBLIC_STAFF_LIFF_ID
          : process.env.NEXT_PUBLIC_LIFF_ID;

        await withTimeout(initLiff(liffId), 10000, "LINE login");
        if (cancelled) return;

        router.replace(target);
      } catch (err) {
        if (cancelled) return;
        console.error("[root] LIFF redirect failed", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="p-6 text-sm text-neutral-600">
        <p className="font-bold mb-2">読み込みに失敗しました</p>
        <ul className="list-disc pl-5 mb-3 space-y-1">
          <li>LINEアプリ内でこのリンクを開いていますか？</li>
          <li>LIFFアプリのEndpoint URLはドメインのみ（パスなし）に設定されていますか？</li>
        </ul>
        <p className="text-xs text-neutral-400 font-mono break-all">{error}</p>
      </div>
    );
  }

  return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
}

export default function RootPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">読み込み中…</div>}>
      <LiffRedirect />
    </Suspense>
  );
}
