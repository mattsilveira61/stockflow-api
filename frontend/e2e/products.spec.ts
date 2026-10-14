import { expect, test } from "@playwright/test";
import { API_KEY, login, uid } from "./helpers";

test.describe("produtos e estoque", () => {
  test.skip(!API_KEY, "defina API_KEY para os testes de escrita");

  test("criar produto → entrada → saldo e histórico → saída acima do saldo é recusada", async ({ page }) => {
    const sku = `E2E-${uid()}`;
    const name = `Produto de teste ${sku}`;

    await page.goto("/produtos");
    await login(page);

    // Criar
    await page.getByRole("button", { name: "Novo produto" }).click();
    const drawer = page.getByRole("dialog", { name: "Novo produto" });
    await drawer.getByLabel("SKU").fill(sku);
    await drawer.getByLabel("Nome").fill(name);
    await drawer.getByLabel("Categoria").selectOption({ label: "Mercearia" });
    await drawer.getByLabel("Preço (R$)").fill("12,90");
    await drawer.getByLabel("Estoque mínimo").fill("5");
    await drawer.getByRole("button", { name: "Criar produto" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Produto ${sku} criado` })).toBeVisible();

    // Aparece na busca, com estoque zerado
    await page.getByLabel("Buscar por nome ou SKU").fill(sku);
    const row = page.getByRole("row").filter({ hasText: sku });
    await expect(row).toContainText("R$ 12,90");
    await expect(row).toContainText("Zerado");

    // Detalhe → entrada de 20
    await row.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await page.getByRole("button", { name: "Entrada / Saída" }).click();
    let modal = page.getByRole("dialog", { name: "Entrada / Saída" });
    await modal.getByLabel("Quantidade").fill("20");
    await expect(modal.getByText("Saldo: 0 → 20")).toBeVisible();
    await modal.getByLabel("Observação (opcional)").fill("NF e2e");
    await modal.getByRole("button", { name: "Registrar entrada" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saldo: 20" })).toBeVisible();
    await expect(page.getByText("Saldo atual").locator("..")).toContainText("20");
    const history = page.getByRole("table").last();
    await expect(history.getByRole("row").nth(1)).toContainText("Compra");
    await expect(history.getByRole("row").nth(1)).toContainText("NF e2e");

    // Saída de 25 com saldo 20: a API recusa e nada muda
    await page.getByRole("button", { name: "Entrada / Saída" }).click();
    modal = page.getByRole("dialog", { name: "Entrada / Saída" });
    await modal.getByRole("radio", { name: "Saída" }).click();
    await modal.getByLabel("Quantidade").fill("25");
    await expect(modal.getByText("(insuficiente)")).toBeVisible();
    await modal.getByRole("button", { name: "Registrar saída" }).click();
    await expect(modal.getByText(/Estoque insuficiente.*disponível 20, solicitado 25/)).toBeVisible();
    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Saldo atual").locator("..")).toContainText("20");

    // Saída válida de 18 → fica abaixo do mínimo (2 <= 5)
    await page.getByRole("button", { name: "Entrada / Saída" }).click();
    modal = page.getByRole("dialog", { name: "Entrada / Saída" });
    await modal.getByRole("radio", { name: "Saída" }).click();
    await modal.getByLabel("Quantidade").fill("18");
    await modal.getByRole("button", { name: "Registrar saída" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saldo: 2" })).toBeVisible();
    await expect(page.getByText("Baixo", { exact: true }).first()).toBeVisible();

    // Aparece no histórico geral filtrado por produto
    await page.getByRole("link", { name: "Movimentações" }).click();
    await page.getByRole("combobox", { name: "Produto" }).fill(sku);
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await expect(page.getByText("2 movimentações")).toBeVisible();
  });

  test("SKU repetido mostra o erro no campo", async ({ page }) => {
    await page.goto("/produtos");
    await login(page);
    await page.getByRole("button", { name: "Novo produto" }).click();
    const drawer = page.getByRole("dialog", { name: "Novo produto" });
    await drawer.getByLabel("SKU").fill("beb-001");
    await drawer.getByLabel("Nome").fill("Duplicado");
    await drawer.getByLabel("Categoria").selectOption({ label: "Bebidas" });
    await drawer.getByLabel("Preço (R$)").fill("1");
    await drawer.getByRole("button", { name: "Criar produto" }).click();
    await expect(drawer.getByText("Já existe um produto com esse SKU")).toBeVisible();
    await expect(drawer.getByLabel("SKU")).toHaveAttribute("aria-invalid", "true");
  });

  test("validação local antes de enviar", async ({ page }) => {
    await page.goto("/produtos");
    await login(page);
    await page.getByRole("button", { name: "Novo produto" }).click();
    const drawer = page.getByRole("dialog", { name: "Novo produto" });
    await drawer.getByLabel("Preço (R$)").fill("abc");
    await drawer.getByRole("button", { name: "Criar produto" }).click();
    await expect(drawer.getByText("Informe o SKU")).toBeVisible();
    await expect(drawer.getByText("Preço inválido")).toBeVisible();
    await expect(drawer.getByText("Escolha uma categoria")).toBeVisible();
  });

  test("editar categoria", async ({ page }) => {
    await page.goto("/categorias");
    await login(page);
    await page.getByRole("button", { name: "Editar Higiene" }).click();
    const drawer = page.getByRole("dialog", { name: "Editar categoria" });
    const description = `Cuidados pessoais ${uid()}`;
    await drawer.getByLabel("Descrição (opcional)").fill(description);
    await drawer.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Higiene" })).toContainText(description);
  });
});

test("modo leitura: listas funcionam e botões de escrita ficam bloqueados", async ({ page }) => {
  await page.goto("/produtos");
  await expect(page.getByRole("button", { name: "Novo produto" })).toBeDisabled();

  // Busca, filtro e ordenação ficam na URL
  await page.getByLabel("Buscar por nome ou SKU").fill("água");
  await expect(page).toHaveURL(/q=%C3%A1gua/);
  await expect(page.getByRole("row").filter({ hasText: "Água mineral 500 ml" })).toBeVisible();
  await page.getByRole("button", { name: "Ordenar por preço" }).click();
  await expect(page).toHaveURL(/sort=unit_price/);

  await page.getByRole("row").filter({ hasText: "Água mineral 500 ml" }).getByRole("link").click();
  await expect(page.getByRole("button", { name: "Entrada / Saída" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Editar" })).toBeDisabled();
  await expect(page.locator(".recharts-line-curve")).toBeVisible();
});

test("paginação de produtos", async ({ page }) => {
  await page.goto("/produtos?status=all");
  await expect(page.getByText(/página 1 de \d/)).toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page.getByText(/página 2 de \d/)).toBeVisible();
  await expect(page).toHaveURL(/page=2/);
});
