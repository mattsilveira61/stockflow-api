import { expect, test, type Page } from "@playwright/test";
import { API_KEY, login, uid } from "./helpers";

/** Saldo atual de um produto direto pela API (o proxy /api do Vite). */
async function stockOf(page: Page, sku: string) {
  const res = await page.request.get(`/api/products?q=${sku}`);
  const item = (await res.json()).items.find((p: { sku: string }) => p.sku === sku);
  return item.stock_quantity as number;
}

async function addToCart(page: Page, search: string, optionName: RegExp) {
  const picker = page.getByRole("combobox", { name: "Adicionar produto" });
  await picker.fill(search);
  await page.getByRole("option", { name: optionName }).click();
}

test.describe("pedidos", () => {
  test.skip(!API_KEY, "defina API_KEY para os testes de escrita");

  test("criar pedido baixa o estoque; cancelar devolve; cancelar de novo não é possível", async ({ page }) => {
    await page.goto("/pedidos");
    await login(page);
    const beforeAgua = await stockOf(page, "BEB-001");
    const beforeArroz = await stockOf(page, "MER-001");

    await page.getByRole("button", { name: "Novo pedido" }).click();
    await expect(page.getByRole("heading", { name: "Novo pedido" })).toBeVisible();

    // Busca sem acento, digitando
    await addToCart(page, "agua mineral", /Água mineral 500 ml/);
    await addToCart(page, "arroz", /Arroz branco 5 kg/);
    await page.getByRole("button", { name: "Aumentar Água mineral 500 ml" }).click();
    await page.getByRole("button", { name: "Aumentar Água mineral 500 ml" }).click();
    await expect(page.getByLabel("Quantidade de Água mineral 500 ml")).toHaveValue("3");
    await expect(page.getByText("2 produtos · 4 un")).toBeVisible();
    await expect(page.getByText("R$ 35,40")).toBeVisible(); // 3 × 2,50 + 27,90

    // Sem cliente não envia
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText("Escolha o cliente", { exact: true })).toBeVisible();
    await page.getByLabel("Cliente").selectOption({ label: "Ana Souza" });
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    // Vai para o detalhe
    await expect(page.getByRole("heading", { name: /Pedido #\d+/ })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Pedido #\d+ criado · R\$\s35,40/ })).toBeVisible();
    await expect(page.getByText("Confirmado")).toBeVisible();
    expect(await stockOf(page, "BEB-001")).toBe(beforeAgua - 3);
    expect(await stockOf(page, "MER-001")).toBe(beforeArroz - 1);

    // Cancelar (com confirmação)
    await page.getByRole("button", { name: "Cancelar pedido" }).click();
    const modal = page.getByRole("dialog", { name: "Cancelar pedido?" });
    await expect(modal.getByText("+3")).toBeVisible();
    await modal.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(page.getByText("Pedido cancelado. O estoque de todos os itens já foi devolvido.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);
    expect(await stockOf(page, "BEB-001")).toBe(beforeAgua);
    expect(await stockOf(page, "MER-001")).toBe(beforeArroz);

    // Cancelar de novo pela API: 409, estoque não muda (a tela já nem oferece o botão)
    const orderId = page.url().split("/").pop();
    const again = await page.request.post(`/api/orders/${orderId}/cancel`, { headers: { "X-API-Key": API_KEY } });
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe("ORDER_ALREADY_CANCELLED");
    expect(await stockOf(page, "BEB-001")).toBe(beforeAgua);
  });

  test("pedido sem estoque mostra o erro e mantém o carrinho", async ({ page }) => {
    await page.goto("/pedidos/novo");
    await login(page);
    await addToCart(page, "lim-002", /Sabão em pó 1 kg/); // zerado no seed
    await addToCart(page, "feijao", /Feijão carioca 1 kg/);
    await expect(page.getByText(/acima do estoque/)).toBeVisible();
    await page.getByLabel("Cliente").selectOption({ label: "Bruno Lima" });
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Estoque insuficiente: LIM-002 \(disponível 0, solicitado 1\)/ })).toBeVisible();
    // Continua na tela, com os dois itens
    await expect(page.getByRole("heading", { name: "Novo pedido" })).toBeVisible();
    await expect(page.getByLabel("Quantidade de Sabão em pó 1 kg")).toBeVisible();
    await expect(page.getByLabel("Quantidade de Feijão carioca 1 kg")).toBeVisible();
    // Remove o item sem estoque e o pedido passa
    await page.getByRole("button", { name: "Remover Sabão em pó 1 kg" }).click();
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByRole("heading", { name: /Pedido #\d+/ })).toBeVisible();
  });

  test("cadastrar e editar cliente; e-mail repetido aparece no campo", async ({ page }) => {
    const email = `cliente.${uid().toLowerCase()}@exemplo.com`;
    await page.goto("/clientes");
    await login(page);
    await page.getByRole("button", { name: "Novo cliente" }).click();
    let drawer = page.getByRole("dialog", { name: "Novo cliente" });
    await drawer.getByLabel("Nome").fill("Otávio Teste");
    await drawer.getByLabel("E-mail").fill(email);
    await drawer.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Cliente cadastrado" })).toBeVisible();

    // Busca sem acento encontra
    await page.getByLabel("Buscar por nome ou e-mail").fill("otavio");
    await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible();

    await page.getByRole("button", { name: "Novo cliente" }).click();
    drawer = page.getByRole("dialog", { name: "Novo cliente" });
    await drawer.getByLabel("Nome").fill("Outra pessoa");
    await drawer.getByLabel("E-mail").fill(email.toUpperCase());
    await drawer.getByRole("button", { name: "Cadastrar" }).click();
    await expect(drawer.getByText("Já existe um cliente com esse e-mail")).toBeVisible();
  });
});

test("lista de pedidos: filtros e navegação para o detalhe", async ({ page }) => {
  await page.goto("/pedidos");
  await expect(page.getByRole("row")).not.toHaveCount(1);
  await page.getByLabel("Status").selectOption("CANCELLED");
  await expect(page).toHaveURL(/status=CANCELLED/);
  const first = page.getByRole("row").nth(1);
  await expect(first).toContainText("Cancelado");
  await first.getByRole("link").click();
  await expect(page.getByText("Pedido cancelado.")).toBeVisible();
});

test("movimentações: filtro de produto por digitação ou pela lista", async ({ page }) => {
  await page.goto("/movimentacoes");
  const picker = page.getByRole("combobox", { name: "Produto" });

  // Digitando, sem acento
  await picker.fill("acucar");
  await page.getByRole("option", { name: /Açúcar refinado 1 kg/ }).click();
  await expect(page).toHaveURL(/product_id=\d+/);
  await expect(picker).toHaveValue(/Açúcar refinado 1 kg · MER-005/);
  await expect(page.getByRole("row").nth(1)).toContainText("Açúcar refinado 1 kg");

  // Recarregar mantém o produto escolhido
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Produto" })).toHaveValue(/Açúcar refinado/);

  // Limpar e escolher pela lista (setas + Enter)
  await page.getByRole("button", { name: "Limpar produto" }).click();
  await expect(page).not.toHaveURL(/product_id/);
  await page.getByRole("button", { name: "Mostrar lista de produtos" }).click();
  await expect(page.getByRole("listbox", { name: "Produto" })).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(page).toHaveURL(/product_id=\d+/);
});

test("busca de produtos ignora acentos", async ({ page }) => {
  await page.goto("/produtos");
  await page.getByLabel("Buscar por nome ou SKU").fill("feijao");
  await expect(page.getByRole("row").filter({ hasText: "Feijão carioca 1 kg" })).toBeVisible();
  await page.getByLabel("Buscar por nome ou SKU").fill("OLEO");
  await expect(page.getByRole("row").filter({ hasText: "Óleo de soja 900 ml" })).toBeVisible();
});
