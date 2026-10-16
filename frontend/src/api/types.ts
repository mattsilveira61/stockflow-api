// Espelho dos schemas da API (app/schemas). Decimais chegam como string ("27.90").

export type Money = string;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit_price: Money;
  stock_quantity: number;
  min_stock: number;
  category_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type MovementType = "IN" | "OUT";
export type MovementReason = "PURCHASE" | "ADJUSTMENT" | "SALE" | "CANCELLATION";

export interface Movement {
  id: number;
  product_id: number;
  order_id: number | null;
  purchase_order_id: number | null;
  movement_type: MovementType;
  reason: MovementReason;
  quantity: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

export interface MovementWithProduct extends Movement {
  sku: string;
  product_name: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = "CONFIRMED" | "CANCELLED";

export interface OrderSummary {
  id: number;
  customer_id: number;
  customer_name: string;
  status: OrderStatus;
  total_amount: Money;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  unit_price: Money;
  subtotal: Money;
}

export interface Order extends OrderSummary {
  items: OrderItem[];
}

export type Role = "ADMIN" | "OPERADOR" | "LEITOR";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PurchaseStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";

export interface PurchaseSummary {
  id: number;
  supplier_id: number;
  supplier_name: string;
  status: PurchaseStatus;
  total_cost: Money;
  note: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: Money;
  subtotal: Money;
}

export interface Purchase extends PurchaseSummary {
  items: PurchaseItem[];
}

export interface RestockSuggestion {
  product_id: number;
  sku: string;
  name: string;
  stock_quantity: number;
  min_stock: number;
  suggested_quantity: number;
}

export interface Dashboard {
  start: string;
  end: string;
  days: number;
  kpis: {
    revenue: Money;
    orders: number;
    average_ticket: Money;
    cancelled_orders: number;
    items_sold: number;
    stock_value: Money;
    active_products: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
  sales_by_day: { date: string; orders: number; revenue: Money }[];
  top_products: { product_id: number; sku: string; name: string; quantity: number; revenue: Money }[];
  recent_movements: MovementWithProduct[];
}
