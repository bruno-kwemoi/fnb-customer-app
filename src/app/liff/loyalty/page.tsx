"use client";

import { useEffect, useState } from "react";
import { getLineProfile } from "@/lib/liff";
import { getPocketBase } from "@/lib/pocketbase";
import type { Customer } from "@/types";

const TIER_LABEL: Record<Customer["loyalty_tier"], string> = {
  regular: "レギュラー",
  silver: "シルバー",
  gold: "ゴールド",
};

export default function LoyaltyPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const profile = await getLineProfile();
      const pb = getPocketBase();
      const record = await pb
        .collection("customers")
        .getFirstListItem<Customer>(`line_user_id="${profile.userId}"`)
        .catch(() => null);
      setCustomer(record);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
  if (!customer) return <div className="p-6 text-sm text-neutral-500">お客様情報が見つかりませんでした。</div>;

  return (
    <div className="p-5">
      <div className="rounded-2xl bg-neutral-900 text-white p-5 mb-5">
        <div className="text-xs opacity-70">{TIER_LABEL[customer.loyalty_tier]} 会員</div>
        <div className="text-3xl font-bold mt-1">{customer.loyalty_points.toLocaleString()} pt</div>
        <div className="text-xs opacity-70 mt-2">{customer.display_name} 様</div>
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">
        ご注文金額 ¥100 ごとに 1pt 貯まります。貯まったポイントは次回のご注文時にご利用いただけます。
      </p>
    </div>
  );
}
