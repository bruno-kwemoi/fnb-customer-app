"use client";

import { useEffect, useState } from "react";
import { getLineIdToken, getLineProfile, withTimeout } from "@/lib/liff";

// Shared by every staff/admin LIFF page (/staff/liff/orders,
// /staff/liff/reports, ...) — handles getting a verified ID token out
// of LIFF, with the timeout + error handling every one of these pages
// needs identically. What each page does with the token afterward
// (check against /api/staff/orders vs /api/admin/reports, and what
// "not authorized" means for that specific page) stays in the page
// itself, since that part genuinely differs.
export type StaffLineTokenState =
  | { phase: "loading" }
  | { phase: "no_id_token" }
  | { phase: "error"; message: string }
  | { phase: "ready"; idToken: string; lineUserId: string; displayName: string };

export function useStaffLineToken(): StaffLineTokenState {
  const [state, setState] = useState<StaffLineTokenState>({ phase: "loading" });

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
        // third-party storage is blocked mid-login-redirect.
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

        setState({ phase: "ready", idToken, lineUserId: profile.userId, displayName: profile.displayName });
      } catch (err) {
        if (cancelled) return;
        console.error("[useStaffLineToken] init failed", err);
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
