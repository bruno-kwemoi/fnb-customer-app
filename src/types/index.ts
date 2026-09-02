// Shared types — mirrors the PocketBase schema in /pocketbase/schema.json

export interface Store {
  id: string;
  name: string;
  name_en?: string;
  line_official_account_id: string; // customer-facing LINE OA for this store
  address?: string;
  is_active: boolean;
}

export interface MenuCategory {
  id: string;
  store: string; // relation -> Store.id
  name: string; // e.g. "お好み焼き"
  sort_order: number;
}

export interface MenuItem {
  id: string;
  store: string; // relation -> Store.id
  category: string; // relation -> MenuCategory.id
  name: string;
  name_en?: string;
  description?: string;
  price: number; // JPY, integer
  image?: string; // PocketBase file field
  is_available: boolean;
  is_recommended?: boolean;
  sort_order: number;
}

export interface Customer {
  id: string;
  line_user_id: string; // unique — from LINE profile
  display_name: string;
  picture_url?: string;
  store: string; // home/primary store, relation -> Store.id
  loyalty_points: number;
  loyalty_tier: "regular" | "silver" | "gold";
  created: string;
}

export interface CartLine {
  menu_item: MenuItem;
  quantity: number;
  notes?: string;
}

export interface Order {
  id?: string;
  store: string;
  customer: string; // relation -> Customer.id
  status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
  order_type: "dine_in" | "takeout";
  table_number?: string;
  items: OrderItem[]; // stored as JSON on the order record
  subtotal: number;
  points_earned: number;
  points_used: number;
  created?: string;
}

export interface OrderItem {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}
