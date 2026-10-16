import { expect, test } from "@playwright/test";
import { API_KEY, login, uid } from "./helpers";

/** Tira o BOM que a API põe no início para o Excel reconhecer o UTF-8. */
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const HEADER = "sku;nome;categoria;preco;estoque_minimo;ativo;descricao\n";

test.describe("planilhas CSV", () => {
  test("exportar produtos baixa o CSV com os filtros da tela", async ({ page }) => {
    await page.goto("/produtos?q=arroz");
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("produtos.csv");

    const text = (await (await file.createReadStream()).toArray()).join("");
    const lines = stripBom(text).trim().split("\r\n");
    expect(lines[0]).toBe("sku;nome;categoria;preco;estoque;estoque_minimo;ativo;descricao");
    expect(lines.slice(1).every((l) => l.toLowerCase().includes("arroz"))).toBe(true);
  });

  test("importar mostra os erros por linha e depois grava com prévia", async ({ page }) => {
    test.skip(!API_KEY, "defina API_KEY para os testes de escrita");
    await page.goto("/produtos");
    await login(page);
    const sku = `CSV-${uid()}`;

    await page.getByRole("button", { name: "Importar" }).click();
    const dialog = page.getByRole("dialog");

    // Arquivo com problema: nada é gravado e cada erro aparece com a linha
    await dialog.getByLabel("Arquivo CSV").setInputFiles({
      name: "ruim.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(HEADER + `${sku};Produto CSV;Categoria que não existe;abc;;;\n`),
    });
    const problems = dialog.getByRole("list", { name: "Problemas encontrados" });
    await expect(problems.getByText("linha 2").first()).toBeVisible();
    await expect(problems.getByText("Preço inválido (use 12,90)")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Importar" })).toBeDisabled();

    // Arquivo bom: prévia primeiro, gravação só ao confirmar
    await dialog.getByLabel("Arquivo CSV").setInputFiles({
      name: "bom.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(HEADER + `${sku};Produto CSV;Mercearia;12,90;4;sim;Importado pelo e2e\n`),
    });
    const preview = dialog.getByLabel("Prévia da importação");
    await expect(preview.getByText("Novos")).toBeVisible();
    await expect(preview.locator("dd").first()).toHaveText("1");
    expect((await (await page.request.get(`/api/products?q=${sku}`)).json()).total).toBe(0);

    await dialog.getByRole("button", { name: "Importar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Importação concluída: 1 criado(s)" })).toBeVisible();
    const created = (await (await page.request.get(`/api/products?q=${sku}`)).json()).items[0];
    expect([created.name, created.unit_price, created.min_stock, created.stock_quantity]).toEqual(["Produto CSV", "12.90", 4, 0]);
  });

  test("exportar movimentações respeita o filtro de motivo", async ({ page }) => {
    await page.goto("/movimentacoes?reason=SALE");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV" }).click();
    const text = (await (await (await download).createReadStream()).toArray()).join("");
    const rows = stripBom(text).trim().split("\r\n").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.split(";")[4] === "Venda")).toBe(true);
  });
});
