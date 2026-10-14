import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ApiError } from "./api/client";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import { CategoriesPage } from "./pages/Categories";
import { DashboardPage } from "./pages/Dashboard";
import { MovementsPage } from "./pages/Movements";
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
              <Route path="pedidos/*" element={<SoonPage title="Pedidos" />} />
              <Route path="clientes" element={<SoonPage title="Clientes" />} />
              <Route path="categorias" element={<CategoriesPage />} />
              <Route path="*" element={<SoonPage title="Página não encontrada" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
