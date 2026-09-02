"use client";

import { useEffect, useState } from "react";
import { getLineProfile } from "@/lib/liff";

type LoyaltyTier = "regular" | "silver" | "gold";

interface LoyaltyInfo {
  displayName: string;
  loyaltyPoints: number;
  loyaltyTier: LoyaltyTier;
}

const TIER_LABEL: Record<LoyaltyTier, string> = {
  regular: "レギュラー",
  silver: "シルバー",
  gold: "ゴールド",
};

export default function LoyaltyPage() {
  const [info, setInfo] = useState<LoyaltyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const profile = await getLineProfile();
      const res = await fetch(`/api/customer?lineUserId=${encodeURIComponent(profile.userId)}`);
      if (res.ok) {
        setInfo(await res.json());
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
  if (!info) return <div className="p-6 text-sm text-neutral-500">お客様情報が見つかりませんでした。</div>;

  return (
    <div className="p-5">
      <div className="rounded-2xl bg-neutral-900 text-white p-5 mb-5">
        <div className="text-xs opacity-70">{TIER_LABEL[info.loyaltyTier]} 会員</div>
        <div className="text-3xl font-bold mt-1">{info.loyaltyPoints.toLocaleString()} pt</div>
        <div className="text-xs opacity-70 mt-2">{info.displayName} 様</div>
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">
        ご注文金額 ¥100 ごとに 1pt 貯まります。貯まったポイントは次回のご注文時にご利用いただけます。
      </p>
    </div>
  );
}
