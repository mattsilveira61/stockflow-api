import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ApiError } from "./api/client";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import { CategoriesPage } from "./pages/Categories";
import { CustomersPage } from "./pages/Customers";
import { DashboardPage } from "./pages/Dashboard";
import { MovementsPage } from "./pages/Movements";
import { NewOrderPage } from "./pages/NewOrder";
import { OrderDetailPage } from "./pages/OrderDetail";
import { OrdersPage } from "./pages/Orders";
import { ProductDetailPage } from "./pages/ProductDetail";
import { ProductsPage } from "./pages/Products";
import { SoonPage } from "./pages/Soon";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Erro de regra (4xx) não adianta repetir; falha de rede ou 5xx tenta mais uma vez.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="produtos" element={<ProductsPage />} />
              <Route path="produtos/:id" element={<ProductDetailPage />} />
              <Route path="movimentacoes" element={<MovementsPage />} />
              <Route path="pedidos" element={<OrdersPage />} />
              <Route path="pedidos/novo" element={<NewOrderPage />} />
              <Route path="pedidos/:id" element={<OrderDetailPage />} />
              <Route path="clientes" element={<CustomersPage />} />
              <Route path="categorias" element={<CategoriesPage />} />
              <Route path="*" element={<SoonPage title="Página não encontrada" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
