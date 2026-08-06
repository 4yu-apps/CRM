import { defineConfig, devices } from "@playwright/test";

// Fluxo de ponta a ponta, contra a app rodando de verdade.
//
// SEMPRE em modo mock: NEXT_PUBLIC_DATA_SOURCE=mock forca a camada de dados em
// memoria mesmo com .env.local apontando pro Supabase. Teste nunca toca a base
// de producao, e nao precisa de login (o AuthGate nao bloqueia no mock).
//
// locale pt-BR de proposito: o <input type="date"> desenha no formato do
// navegador, entao testar em en-US mostraria MM/DD e esconderia como o dono ve.
const PORTA = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // build + start, nao dev: e o bundle que vai pro ar que interessa.
    command: `NEXT_PUBLIC_DATA_SOURCE=mock npm run build && NEXT_PUBLIC_DATA_SOURCE=mock npm run start -- --port ${PORTA}`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
