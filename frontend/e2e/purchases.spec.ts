import type { Page } from "@playwright/test";
import { expect, login, test, uid, authHeaders } from "./helpers";

async function stockOf(page: Page, sku: string) {
  const res = await page.request.get(`/api/products?q=${sku}`, { headers: await authHeaders(page.request) });
  const item = (await res.json()).items.find((p: { sku: string }) => p.sku === sku);
  return item.stock_quantity as number;
}

test.describe("compras", () => {

  test("rascunho → enviar → receber dá entrada no estoque uma vez só", async ({ page }) => {
    await page.goto("/compras");
    await login(page);

    // Fornecedor novo pela tela de fornecedores
    const supplier = `Fornecedor E2E ${uid()}`;
    await page.getByRole("link", { name: "Fornecedores" }).click();
    await page.getByRole("button", { name: "Novo fornecedor" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(supplier);
    await page.getByLabel("E-mail (opcional)").fill("e2e@exemplo.com");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Fornecedor cadastrado." })).toBeVisible();

    const before = await stockOf(page, "MER-001");
    await page.getByRole("link", { name: "Compras" }).click();
    await page.getByRole("button", { name: "Nova compra" }).click();
    await expect(page.getByRole("heading", { name: "Nova compra" })).toBeVisible();
    // O seed deixa produtos abaixo do mínimo: a sugestão aparece
    await expect(page.getByText("Sugestão de reposição")).toBeVisible();

    const picker = page.getByRole("combobox", { name: "Adicionar produto" });
    await picker.fill("arroz");
    await page.getByRole("option", { name: /Arroz branco 5 kg/ }).click();
    await page.getByLabel("Quantidade de Arroz branco 5 kg").fill("12");
    await page.getByLabel("Custo unitário de Arroz branco 5 kg").fill("15,50");
    await expect(page.getByText("R$ 186,00").first()).toBeVisible();

    // Sem fornecedor não salva
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByText("Escolha o fornecedor", { exact: true })).toBeVisible();
    await page.getByLabel("Fornecedor").selectOption({ label: supplier });
    await page.getByRole("button", { name: "Salvar rascunho" }).click();

    await expect(page.getByRole("heading", { name: /Compra #\d+/ })).toBeVisible();
    await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
    expect(await stockOf(page, "MER-001")).toBe(before);

    await page.getByRole("button", { name: "Enviar ao fornecedor" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Enviado", { exact: true })).toBeVisible();
    expect(await stockOf(page, "MER-001")).toBe(before);

    await page.getByRole("button", { name: "Receber mercadoria" }).click();
    await expect(page.getByRole("dialog").getByText("+12")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mercadoria recebida" })).toBeVisible();
    await expect(page.getByText("Recebido", { exact: true })).toBeVisible();
    // Compra recebida não tem mais ações
    await expect(page.getByRole("button", { name: "Receber mercadoria" })).toHaveCount(0);
    expect(await stockOf(page, "MER-001")).toBe(before + 12);

    // Receber de novo pela API também não duplica
    const id = page.url().split("/").pop();
    const again = await page.request.post(`/api/purchases/${id}/receive`, { headers: await authHeaders(page.request) });
    expect(again.status()).toBe(409);
    expect(await stockOf(page, "MER-001")).toBe(before + 12);

    // A movimentação aponta para a compra
    await page.getByRole("link", { name: "Arroz branco 5 kg" }).click();
    await expect(page.getByRole("link", { name: `Compra #${id} · ${supplier}` }).first()).toBeVisible();
  });

  test("lista filtra por status", async ({ page }) => {
    await page.goto("/compras?status=ORDERED");
    await expect(page.getByRole("heading", { name: "Pedidos de compra" })).toBeVisible();
    await expect(page.getByLabel("Status")).toHaveValue("ORDERED");
    const badges = page.locator("tbody").getByText(/Rascunho|Recebido|Cancelado/);
    await expect(badges).toHaveCount(0);
  });
});
