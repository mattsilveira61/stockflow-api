import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Category, Page, Product } from "./types";

/** Todas as categorias (são poucas): usadas em selects e para mostrar o nome na tabela. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api.get<Page<Category>>("/categories", { page_size: 100 }),
    staleTime: 60_000,
  });
}

/** Lista curta de produtos para selects (filtro do histórico, carrinho de pedido). */
export function useProductOptions() {
  return useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.get<Page<Product>>("/products", { page_size: 100, sort: "name" }),
    staleTime: 30_000,
  });
}

/** Tudo o que depende do saldo: invalidar depois de qualquer movimentação ou pedido. */
export const STOCK_KEYS = [["products"], ["product"], ["product-movements"], ["movements"], ["dashboard"], ["low-stock"]];

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: unknown[][]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
