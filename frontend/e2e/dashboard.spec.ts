import { expect, test } from "./helpers";

test("dashboard mostra indicadores, gráficos e listas com dados reais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  for (const label of ["Faturamento", "Pedidos", "Valor em estoque", "Estoque baixo"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/R\$\s?\d/).first()).toBeVisible();
  await expect(page.locator(".recharts-area-curve")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mais vendidos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimas movimentações" })).toBeVisible();
});

test("trocar o período recarrega os números", async ({ page }) => {
  await page.goto("/");
  const revenue = page.locator("p.num").first();
  await expect(revenue).toContainText("R$");
  const before = await revenue.textContent();

  const response = page.waitForResponse((r) => r.url().includes("/api/dashboard?days=7"));
  await page.getByRole("radio", { name: "7d" }).click();
  await response;
  await expect(page.getByRole("radio", { name: "7d" })).toHaveAttribute("aria-checked", "true");
  await expect(revenue).not.toHaveText(before ?? "");
});

test.describe("login", () => {
  test.use({ who: null });

  test("sem login só aparece a tela de entrar; senha errada mostra o erro", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
    await page.getByLabel("E-mail").fill("admin@stockflow.dev");
    await page.getByLabel("Senha").fill("errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos");
  });

  test("usuário de demonstração entra com um clique e sai", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Operador/ }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Otávio Operador").first()).toBeVisible();
    // Menu de usuários é só do admin
    await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sair" }).first().click();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});

test.describe("leitor", () => {
  test.use({ who: "leitor" });

  test("vê tudo mas os botões de alterar ficam bloqueados", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page.getByRole("button", { name: "Novo produto" })).toBeDisabled();
    await page.getByRole("row").filter({ hasText: "Água mineral 500 ml" }).getByRole("link").click();
    await expect(page.getByRole("button", { name: "Entrada / Saída" })).toBeDisabled();
    await page.goto("/pedidos");
    await expect(page.getByRole("button", { name: "Novo pedido" })).toBeDisabled();
  });
});

test.describe("operador", () => {
  test.use({ who: "operador" });

  test("registra movimentação mas não altera o catálogo", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page.getByRole("button", { name: "Novo produto" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Importar" })).toBeDisabled();
    await page.getByRole("row").filter({ hasText: "Água mineral 500 ml" }).getByRole("link").click();
    await expect(page.getByRole("button", { name: "Entrada / Saída" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Editar" })).toBeDisabled();
  });
});

test("admin gerencia usuários", async ({ page }) => {
  await page.goto("/usuarios");
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "leitor@stockflow.dev" })).toContainText("Leitor");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const drawer = page.getByRole("dialog", { name: "Novo usuário" });
  await drawer.getByRole("button", { name: "Criar usuário" }).click();
  await expect(drawer.getByText("Mínimo de 8 caracteres")).toBeVisible();
  await drawer.getByLabel("Nome").fill("Duplicado");
  await drawer.getByLabel("E-mail").fill("leitor@stockflow.dev");
  await drawer.getByLabel("Senha").fill("12345678");
  await drawer.getByRole("button", { name: "Criar usuário" }).click();
  await expect(drawer.getByText("Já existe um usuário com esse e-mail")).toBeVisible();
});

test("tema escuro é lembrado ao recarregar", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
  await page.getByRole("button", { name: wasDark ? "Usar tema claro" : "Usar tema escuro" }).click();
  await page.reload();
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
});
