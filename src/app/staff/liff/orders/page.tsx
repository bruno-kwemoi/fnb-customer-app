"use client";

import { useEffect, useMemo, useState } from "react";
import { withTimeout } from "@/lib/liff";
import { useStaffLineToken } from "@/lib/use-staff-line-token";
import StaffOrdersDashboard from "@/components/staff/OrdersDashboard";
import {
  LiffLoadingScreen,
  LiffErrorScreen,
  NoIdTokenScreen,
  NotRegisteredScreen,
} from "@/components/staff/LiffStatusScreens";

// Personal LINE entry point for staff/admin — opened from LINE (via
// the staff rich menu or a shared link), not a shared device. The
// LIFF ID token is verified against LINE server-side (see
// verifyLineIdToken in lib/line.ts) and matched against the `staffs`
// PocketBase collection; unlike the customer flow, a client claiming
// a userId isn't enough here.
//
// Requires NEXT_PUBLIC_STAFF_LIFF_ID and a LIFF app in the LINE
// Developers Console with "ID token" enabled — see README.

type CheckState = "checking" | "authorized" | "not_registered";

export default function StaffLiffOrdersPage() {
  const tokenState = useStaffLineToken();
  const [checkState, setCheckState] = useState<CheckState>("checking");

  useEffect(() => {
    if (tokenState.phase !== "ready") return;
    let cancelled = false;
    (async () => {
      // Check once up front so an unregistered person sees a useful
      // "here's your ID, ask your manager" screen instead of the
      // dashboard silently failing to load anything.
      const res = await withTimeout(
        fetch("/api/staff/orders?status=all", { headers: { "x-staff-id-token": tokenState.idToken } }),
        10000,
        "Staff check request"
      ).catch(() => null);
      if (cancelled) return;
      setCheckState(res && res.ok ? "authorized" : "not_registered");
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenState]);

  const authHeaders = useMemo<Record<string, string>>(
    () => (tokenState.phase === "ready" ? { "x-staff-id-token": tokenState.idToken } : ({} as Record<string, string>)),
    [tokenState]
  );

  if (tokenState.phase === "loading") return <LiffLoadingScreen />;
  if (tokenState.phase === "error") return <LiffErrorScreen message={tokenState.message} />;
  if (tokenState.phase === "no_id_token") return <NoIdTokenScreen />;

  // tokenState.phase === "ready" past this point
  if (checkState === "checking") return <LiffLoadingScreen />;
  if (checkState === "not_registered") {
    return <NotRegisteredScreen lineUserId={tokenState.lineUserId} displayName={tokenState.displayName} />;
  }

  return (
    <StaffOrdersDashboard authHeaders={authHeaders} onUnauthorized={() => setCheckState("not_registered")} />
  );
}
