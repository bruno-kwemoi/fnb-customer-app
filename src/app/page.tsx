"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { initLiff } from "@/lib/liff";

// This is what the LIFF app's Endpoint URL points at (the domain
// root). LIFF redirects here with the originally-requested path in
// the `liff.state` query param — e.g. opening
// https://liff.line.me/{liffId}/liff/menu lands here with
// ?liff.state=%2Fliff%2Fmenu — and it's on us to read that and
// route to the right page. Falls back to /liff/menu if state is
// missing (e.g. someone opens the bare LIFF URL with no subpath).
function LiffRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    (async () => {
      await initLiff();
      const state = searchParams.get("liff.state");
      const target = state && state.startsWith("/") ? state : "/liff/menu";
      router.replace(target);
    })();
  }, [router, searchParams]);

  return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
}

export default function RootPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">読み込み中…</div>}>
      <LiffRedirect />
    </Suspense>
  );
}
