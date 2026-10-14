import { expect, test } from "@playwright/test";

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

test("sem chave o painel fica em modo leitura; com chave errada mostra erro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Modo leitura").first()).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("Chave de acesso").fill("chave-errada");
  await page.getByRole("dialog").getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(/Chave inválida/);
});

test("com a chave certa libera o acesso completo", async ({ page }) => {
  test.skip(!process.env.API_KEY, "defina API_KEY para este teste");
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("Chave de acesso").fill(process.env.API_KEY!);
  await page.getByRole("dialog").getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Acesso completo").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Acesso liberado" })).toBeVisible();
});

test("tema escuro é lembrado ao recarregar", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
  await page.getByRole("button", { name: wasDark ? "Usar tema claro" : "Usar tema escuro" }).click();
  await page.reload();
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
});
