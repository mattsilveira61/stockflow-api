import { useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, request } from "../api/client";
import type { User } from "../api/types";
import { ROLE_LABEL, setSession } from "../lib/session";
import { Button } from "./ui";

// Usuários do seed (DEMO_PASSWORD no .env). É um projeto de demonstração: os dados são fictícios.
const DEMO_PASSWORD = "stockflow123";
const DEMO_USERS: { email: string; role: User["role"]; text: string }[] = [
  { email: "admin@stockflow.dev", role: "ADMIN", text: "Tudo, inclusive catálogo e usuários" },
  { email: "operador@stockflow.dev", role: "OPERADOR", text: "Pedidos, compras e movimentações" },
  { email: "leitor@stockflow.dev", role: "LEITOR", text: "Só consulta" },
];

/** Tela de login: o painel inteiro exige um usuário (a API recusa qualquer consulta sem token). */
export function LoginScreen({ expired }: { expired?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(expired ? "Sua sessão expirou. Entre de novo." : null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function login(emailValue: string, passwordValue: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await request<{ access_token: string; user: User }>("POST", "/auth/login", {
        body: { email: emailValue.trim(), password: passwordValue },
      });
      // Dados de outro usuário não podem aparecer para este
      queryClient.clear();
      setSession({ token: res.access_token, user: res.user });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() && password) login(email, password);
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-[min(28rem,100%)] rounded-[4px] border border-line-strong bg-panel shadow-[6px_6px_0_var(--ink)]">
        <div className="hazard h-1.5" />
        <form onSubmit={submit} className="p-6">
          <p className="label">StockFlow · estoque e pedidos</p>
          <h1 className="font-display mt-1 text-4xl">Entrar</h1>

          <label className="label mt-5 mb-1.5 block" htmlFor="login-email">
            E-mail
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-[3px] border border-line-strong bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <label className="label mt-3 mb-1.5 block" htmlFor="login-password">
            Senha
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-[3px] border border-line-strong bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" icon={LogIn} loading={loading} disabled={!email.trim() || !password} className="mt-5 w-full">
            Entrar
          </Button>
        </form>

        <div className="border-t border-dashed border-line-strong p-6 pt-5">
          <p className="label mb-2">Entrar com um usuário de demonstração</p>
          <div className="grid gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                disabled={loading}
                onClick={() => login(u.email, DEMO_PASSWORD)}
                className="flex items-center justify-between gap-3 rounded-[3px] border border-line px-3 py-2 text-left hover:border-ink hover:bg-sunken disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-semibold">{ROLE_LABEL[u.role]}</span>
                  <span className="block text-xs text-ink-3">{u.text}</span>
                </span>
                <span className="num text-[0.7rem] text-ink-3">{u.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
