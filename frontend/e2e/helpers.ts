import { test as base, type APIRequestContext, type Page } from "@playwright/test";

// Usuários do seed (DEMO_PASSWORD no .env da API).
export const PASSWORD = process.env.DEMO_PASSWORD ?? "stockflow123";
export const USERS = {
  admin: "admin@stockflow.dev",
  operador: "operador@stockflow.dev",
  leitor: "leitor@stockflow.dev",
} as const;
export type Who = keyof typeof USERS;

/** Faz login pela API e guarda a sessão no sessionStorage antes da página carregar (pula a tela de login). */
export async function signIn(page: Page, who: Who = "admin") {
  const res = await page.request.post("/api/auth/login", { data: { email: USERS[who], password: PASSWORD } });
  if (!res.ok()) throw new Error(`login de ${who} falhou: ${res.status()} ${await res.text()}`);
  const { access_token: token, user } = await res.json();
  await page.addInitScript((session) => sessionStorage.setItem("stockflow.session", session), JSON.stringify({ token, user }));
  return token as string;
}

/** Cabeçalho para chamar a API direto (fora do navegador) como um usuário. */
export async function authHeaders(request: APIRequestContext, who: Who = "admin") {
  const res = await request.post("/api/auth/login", { data: { email: USERS[who], password: PASSWORD } });
  return { Authorization: `Bearer ${(await res.json()).access_token}` };
}

/**
 * `test` já logado: como admin por padrão, ou com outro perfil via `test.use({ who: "leitor" })`.
 * Use `who: null` para testar a tela de login.
 */
export const test = base.extend<{ who: Who | null }>({
  who: ["admin", { option: true }],
  // `provide` é o callback do Playwright (o nome `use` confunde a regra de hooks do React)
  page: async ({ page, who }, provide) => {
    if (who) await signIn(page, who);
    await provide(page);
  },
});

export { expect } from "@playwright/test";

/** Mantido para os testes de escrita: a sessão já entrou pelo fixture `page`. */
export async function login(page: Page) {
  void page;
}

/** Sufixo único: os testes rodam contra o banco de demonstração e não podem colidir entre execuções. */
export const uid = () => Date.now().toString(36).slice(-6).toUpperCase();
