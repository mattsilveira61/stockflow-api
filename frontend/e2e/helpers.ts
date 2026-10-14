import { expect, type Page } from "@playwright/test";

export const API_KEY = process.env.API_KEY ?? "";

/** Entra com a chave pelo diálogo (o mesmo caminho de um usuário). */
export async function login(page: Page) {
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("Chave de acesso").fill(API_KEY);
  await page.getByRole("dialog").getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Acesso completo").first()).toBeVisible();
}

/** Sufixo único: os testes rodam contra o banco de demonstração e não podem colidir entre execuções. */
export const uid = () => Date.now().toString(36).slice(-6).toUpperCase();
