"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initLiff, getLineProfile } from "@/lib/liff";
import { getPocketBase } from "@/lib/pocketbase";
import { resolveStoreId } from "@/lib/store";
import type { MenuCategory, MenuItem, CartLine } from "@/types";

export default function MenuPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await initLiff();
      await getLineProfile(); // ensures login; profile used later at checkout

      const storeId = await resolveStoreId();
      const pb = getPocketBase();
      const [cats, menuItems] = await Promise.all([
        pb.collection("menu_categories").getFullList<MenuCategory>({
          filter: `store="${storeId}"`,
          sort: "sort_order",
        }),
        pb.collection("menu_items").getFullList<MenuItem>({
          filter: `store="${storeId}" && is_available=true`,
          sort: "sort_order",
        }),
      ]);
      setCategories(cats);
      setItems(menuItems);

      const savedCart = sessionStorage.getItem("cart");
      if (savedCart) setCart(JSON.parse(savedCart));

      setLoading(false);
    })();
  }, []);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item.id === item.id);
      const next = existing
        ? prev.map((l) =>
            l.menu_item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l
          )
        : [...prev, { menu_item: item, quantity: 1 }];
      sessionStorage.setItem("cart", JSON.stringify(next));
      return next;
    });
  }

  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.menu_item.price * l.quantity, 0);

  if (loading) return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;

  return (
    <div className="pb-24">
      {categories.map((cat) => (
        <section key={cat.id} className="px-4 pt-5">
          <h2 className="text-sm font-bold text-neutral-700 mb-2">{cat.name}</h2>
          <div className="flex flex-col gap-2">
            {items
              .filter((i) => i.category === cat.id)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
                >
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-neutral-500 mt-0.5">{item.description}</div>
                    )}
                    <div className="text-sm font-bold mt-1">¥{item.price.toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => addToCart(item)}
                    className="shrink-0 rounded-full bg-green-700 text-white text-xs font-bold px-4 py-2"
                  >
                    追加
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}

      {cartCount > 0 && (
        <button
          onClick={() => router.push("/liff/cart")}
          className="fixed bottom-4 left-4 right-4 rounded-xl bg-neutral-900 text-white text-sm font-bold py-3 flex items-center justify-between px-5"
        >
          <span>{cartCount}点をカートに追加中</span>
          <span>¥{cartTotal.toLocaleString()} → カートを見る</span>
        </button>
      )}
    </div>
  );
}
