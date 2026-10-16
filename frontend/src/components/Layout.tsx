import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  ShoppingCart,
  Sun,
  Tags,
  Truck,
  UserCog,
  Users,
  ClipboardList,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { ROLE_LABEL, setSession, takeExpired, useCan, useSession } from "../lib/session";
import { toggleTheme, useDarkMode } from "../lib/theme";
import { LoginScreen } from "./LoginDialog";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, code: "01" },
  { to: "/produtos", label: "Produtos", icon: Boxes, code: "02" },
  { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight, code: "03" },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingCart, code: "04" },
  { to: "/compras", label: "Compras", icon: ClipboardList, code: "05" },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, code: "06" },
  { to: "/clientes", label: "Clientes", icon: Users, code: "07" },
  { to: "/categorias", label: "Categorias", icon: Tags, code: "08" },
  { to: "/usuarios", label: "Usuários", icon: UserCog, code: "09", adminOnly: true },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-8 place-items-center overflow-hidden rounded-[3px] bg-ink">
        <span className="hazard absolute inset-x-0 bottom-0 h-1.5" />
        <span className="font-display -mt-1 text-lg leading-none text-signal">S</span>
      </div>
      <div className="leading-none">
        <p className="font-display text-[1.35rem] text-ink">StockFlow</p>
        <p className="label mt-0.5 !text-[0.6rem]">estoque · pedidos</p>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const isAdmin = useCan("admin");
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon, code }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              "group relative flex items-center gap-3 rounded-[3px] px-3 py-2 text-sm font-medium transition",
              isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken hover:text-ink",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-signal" />}
              <Icon className="size-4" strokeWidth={2} />
              <span className="flex-1">{label}</span>
              <span className={clsx("num text-[0.625rem]", isActive ? "text-paper/50" : "text-ink-3/70")}>{code}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserBox() {
  const session = useSession();
  const queryClient = useQueryClient();
  if (!session) return null;
  const { user } = session;
  return (
    <div className="rounded-[3px] border border-line p-3">
      <p className="truncate text-sm font-semibold">{user.name}</p>
      <p className="label mt-0.5 flex items-center gap-1.5">
        {user.role === "LEITOR" && <Lock className="size-3" />}
        {ROLE_LABEL[user.role]}
      </p>
      {user.role === "LEITOR" && <p className="mt-1 text-xs text-ink-3">Você vê tudo, mas não altera nada.</p>}
      <button
        onClick={() => {
          setSession(null);
          queryClient.clear();
        }}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
      >
        <LogOut className="size-3.5" /> Sair
      </button>
    </div>
  );
}

export function Layout() {
  const dark = useDarkMode();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!session) return <LoginScreen expired={takeExpired()} />;

  const sidebarBody = (
    <>
      <Sidebar onNavigate={() => setMenuOpen(false)} />
      <div className="mt-auto pt-6">
        <UserBox />
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      {/* Barra lateral fixa (telas grandes) */}
      <aside className="hidden border-r border-line bg-panel/80 backdrop-blur lg:block">
        <div className="sticky top-0 flex h-dvh flex-col px-4 py-5">
          <div className="mb-7 px-1">
            <Logo />
          </div>
          {sidebarBody}
        </div>
      </aside>

      {/* Menu do celular */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-ink/40" onClick={() => setMenuOpen(false)} />
          <aside className="rise absolute inset-y-0 left-0 flex w-72 flex-col bg-panel px-4 py-5">
            <div className="mb-7 flex items-center justify-between px-1">
              <Logo />
              <button aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="p-1 text-ink-2">
                <X className="size-5" />
              </button>
            </div>
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-6">
          <button aria-label="Abrir menu" onClick={() => setMenuOpen(true)} className="-ml-1 p-1 text-ink-2 lg:hidden">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
              title={dark ? "Tema claro" : "Tema escuro"}
              className="grid size-8 place-items-center rounded-[3px] border border-line-strong text-ink-2 hover:border-ink hover:text-ink"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>

        <main key={pathname} className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

    </div>
  );
}

export function PageHeader({ title, eyebrow, actions }: { title: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-[0.9] sm:text-5xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
