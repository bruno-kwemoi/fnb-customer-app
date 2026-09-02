"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLineProfile, closeLiffWindow } from "@/lib/liff";
import { resolveStoreId } from "@/lib/store";
import type { CartLine, OrderItem } from "@/types";

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "takeout">("dine_in");
  const [tableNumber, setTableNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ pointsEarned: number } | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("cart");
    if (saved) setCart(JSON.parse(saved));
  }, []);

  function updateQty(itemId: string, delta: number) {
    setCart((prev) => {
      const next = prev
        .map((l) =>
          l.menu_item.id === itemId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0);
      sessionStorage.setItem("cart", JSON.stringify(next));
      return next;
    });
  }

  const total = cart.reduce((sum, l) => sum + l.menu_item.price * l.quantity, 0);

  async function submitOrder() {
    setSubmitting(true);
    try {
      const profile = await getLineProfile();
      const storeId = await resolveStoreId();
      const items: OrderItem[] = cart.map((l) => ({
        menu_item_id: l.menu_item.id,
        name: l.menu_item.name,
        unit_price: l.menu_item.price,
        quantity: l.quantity,
      }));

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.userId,
          storeId,
          orderType,
          tableNumber: orderType === "dine_in" ? tableNumber : undefined,
          items,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      sessionStorage.removeItem("cart");
      setConfirmed({ pointsEarned: data.pointsEarned });
    } catch (err) {
      console.error(err);
      alert("注文の送信に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="p-6 text-center pt-16">
        <div className="text-2xl mb-2">✅</div>
        <h1 className="text-lg font-bold mb-1">ご注文ありがとうございます</h1>
        <p className="text-sm text-neutral-500 mb-4">
          {confirmed.pointsEarned}pt 獲得しました。LINEに確認メッセージを送信しました。
        </p>
        <button
          onClick={closeLiffWindow}
          className="rounded-xl bg-neutral-900 text-white text-sm font-bold px-6 py-3"
        >
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 pb-28">
      <h1 className="text-base font-bold mb-3">ご注文内容</h1>

      <div className="flex flex-col gap-2 mb-4">
        {cart.map((l) => (
          <div
            key={l.menu_item.id}
            className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
          >
            <div>
              <div className="text-sm font-semibold">{l.menu_item.name}</div>
              <div className="text-xs text-neutral-500">¥{l.menu_item.price.toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => updateQty(l.menu_item.id, -1)} className="w-7 h-7 rounded-full border text-sm">−</button>
              <span className="text-sm font-bold w-4 text-center">{l.quantity}</span>
              <button onClick={() => updateQty(l.menu_item.id, 1)} className="w-7 h-7 rounded-full border text-sm">＋</button>
            </div>
          </div>
        ))}
        {cart.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-8">カートは空です</p>
        )}
      </div>

      <div className="mb-4">
        <label className="text-xs font-bold text-neutral-600 block mb-1.5">ご利用方法</label>
        <div className="flex gap-2">
          {(["dine_in", "takeout"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-bold border ${
                orderType === t ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300 text-neutral-600"
              }`}
            >
              {t === "dine_in" ? "店内" : "テイクアウト"}
            </button>
          ))}
        </div>
      </div>

      {orderType === "dine_in" && (
        <div className="mb-4">
          <label className="text-xs font-bold text-neutral-600 block mb-1.5">テーブル番号</label>
          <input
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="例：5"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {cart.length > 0 && (
        <button
          onClick={submitOrder}
          disabled={submitting || (orderType === "dine_in" && !tableNumber)}
          className="fixed bottom-4 left-4 right-4 rounded-xl bg-green-700 disabled:opacity-50 text-white text-sm font-bold py-3 flex items-center justify-between px-5"
        >
          <span>{submitting ? "送信中…" : "注文を確定する"}</span>
          <span>¥{total.toLocaleString()}</span>
        </button>
      )}
    </div>
  );
}
