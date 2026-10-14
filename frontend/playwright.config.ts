import { defineConfig, devices } from "@playwright/test";

// Local: usa o Edge já instalado (sem baixar navegador). No CI: Chromium do Playwright.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "browser", use: { ...devices["Desktop Chrome"], ...(ci ? {} : { channel: "msedge" }) } }],
  webServer: {
    command: "npm run dev -- --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
