import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Testes de logica pura (lib/). Nada de DOM aqui: componente e fluxo sao
// cobertos pelo Playwright, contra a app rodando de verdade.
//
// TZ fixado em America/Sao_Paulo de proposito. As contas de data deste projeto
// (fechamento de contrato, renovacao) escorregam de dia em fuso a oeste de
// Greenwich, e um teste que roda em UTC passaria escondendo exatamente o bug que
// ele existe pra pegar.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
