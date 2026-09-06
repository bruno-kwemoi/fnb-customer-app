"use client";

import { useEffect, useMemo, useState } from "react";
import StaffOrdersDashboard from "@/components/staff/OrdersDashboard";

// Shared-device (tablet/counter) entry point — passcode only, no
// per-person identity. See /staff/liff/orders for the LINE-based,
// per-person alternative.
const CODE_STORAGE_KEY = "staff_code";

export default function StaffOrdersPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(CODE_STORAGE_KEY);
    if (saved) setCode(saved);
  }, []);

  async function submitCode() {
    setAuthError("");
    setChecking(true);
    try {
      const res = await fetch("/api/staff/orders?status=all", {
        headers: { "x-staff-code": codeInput },
      });
      if (res.status === 401) {
        setAuthError("コードが正しくありません。");
        return;
      }
      sessionStorage.setItem(CODE_STORAGE_KEY, codeInput);
      setCode(codeInput);
    } finally {
      setChecking(false);
    }
  }

  function handleUnauthorized() {
    sessionStorage.removeItem(CODE_STORAGE_KEY);
    setCode(null);
    setAuthError("コードが正しくありません。");
  }

  const authHeaders = useMemo<Record<string, string>>(
    () => (code ? { "x-staff-code": code } : ({} as Record<string, string>)),
    [code]
  );

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
            disabled={!codeInput || checking}
            className="w-full rounded-xl bg-neutral-900 disabled:opacity-50 text-white text-sm font-bold py-3"
          >
            {checking ? "確認中…" : "ログイン"}
          </button>
          <p className="text-xs text-neutral-400 text-center mt-4">
            個人のLINEでアクセスする場合は、スタッフ用のLINEリンクからどうぞ。
          </p>
        </div>
      </div>
    );
  }

  return <StaffOrdersDashboard authHeaders={authHeaders} onUnauthorized={handleUnauthorized} />;
}
