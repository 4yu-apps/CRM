import { test, expect } from "@playwright/test";

// Carteira: churn de ponta a ponta, e a tela respondendo "o que eu faco hoje?".
//
// O que a Fatia 3 veio matar: o MRR so subia. Somava todo contrato mensal ja
// fechado, pra sempre, e quem cancelou continuava contando como receita. Numero
// que so cresce nao serve pra decidir nada.

async function cadastrarCliente(page: import("@playwright/test").Page, nome: string, valor: string) {
  await page.goto("/contatos");
  await page.getByRole("button", { name: "Novo contato" }).click();
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill(nome);
  await page.getByPlaceholder("Ex: 1500").fill(valor);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/\/clientes/);
}

test("a tela abre onde ha o que fazer", async ({ page }) => {
  // Com alguem pedindo atencao, abre em Atencao. Sem nada pendente, abrir numa
  // aba vazia seria esconder a carteira de quem acabou de cadastrar um cliente.
  await page.goto("/contatos");
  await page.getByRole("button", { name: "Novo contato" }).click();
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill("Pede Atencao ME");
  await page.getByRole("button", { name: "Salvar", exact: true }).click(); // sem valor = pede atencao
  await page.waitForURL(/\/clientes/);
  await expect(page.getByRole("button", { name: /^Atenção/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("sem valor registrado")).toBeVisible();
});

test("sem nada pendente, a carteira aparece em vez de uma aba vazia", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.getByRole("button", { name: /^Ativos/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Pilates Corpo Leve" }).first()).toBeVisible();
});

test("reativar frios saiu de Clientes: prospeccao nao mora na carteira", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.getByText(/Reativar frios/i)).toHaveCount(0);
});

test("registrar saida tira o cliente do MRR e manda pra Encerrados", async ({ page }) => {
  await cadastrarCliente(page, "Padaria Sai Fora", "2000");

  // Mira o botao pelo NOME DO CLIENTE: no desktop a lista e tabela e no celular
  // vira cartao, entao seletor de linha so funcionaria num dos dois.
  await page.getByRole("button", { name: /^Ativos/ }).click();
  const sair = page.getByRole("button", { name: "Registrar saída de Padaria Sai Fora" });
  await expect(sair).toBeVisible();
  await sair.click();
  await expect(page.getByText("Cliente saiu")).toBeVisible();
  await page.getByRole("button", { name: "Preço", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar saída" }).click();

  // Sai dos ativos...
  await page.getByRole("button", { name: /^Ativos/ }).click();
  await expect(page.getByRole("button", { name: "Registrar saída de Padaria Sai Fora" })).toHaveCount(0);

  // ...e aparece em Encerrados, com o motivo, que e a parte que ensina algo.
  // `.first()` porque o toast de sucesso tambem diz o nome do cliente.
  await page.getByRole("button", { name: /^Encerrados/ }).click();
  await expect(page.getByRole("link", { name: "Padaria Sai Fora" })).toBeVisible();
  await expect(page.getByText("Preço").first()).toBeVisible();

  // E o MRR ativo cai: era exatamente esse numero que so subia antes.
  await expect(page.getByText("MRR ativo").locator("..")).toContainText("R$ 0");
});

test("o motivo da saida e obrigatorio", async ({ page }) => {
  await cadastrarCliente(page, "Sem Motivo Ltda", "800");
  await page.getByRole("button", { name: /^Ativos/ }).click();
  await page.getByRole("button", { name: "Registrar saída de Sem Motivo Ltda" }).click();
  await page.getByRole("button", { name: "Confirmar saída" }).click();
  await expect(page.getByText(/por que ele saiu/i)).toBeVisible();
});

test("cliente que volta entra de novo na carteira", async ({ page }) => {
  await cadastrarCliente(page, "Vai e Volta ME", "1200");
  await page.getByRole("button", { name: /^Ativos/ }).click();
  await page.getByRole("button", { name: "Registrar saída de Vai e Volta ME" }).click();
  await page.getByRole("button", { name: "Trocou de fornecedor" }).click();
  await page.getByRole("button", { name: "Confirmar saída" }).click();

  await page.getByRole("button", { name: /^Encerrados/ }).click();
  await page.getByRole("button", { name: "Voltou" }).first().click();
  await expect(page.getByText(/voltou pra carteira/i)).toBeVisible();

  await page.getByRole("button", { name: /^Ativos/ }).click();
  await expect(page.getByRole("button", { name: "Registrar saída de Vai e Volta ME" })).toBeVisible();
});

test("a ficha de um cliente nao o chama de lead nem manda pra fila", async ({ page }) => {
  await page.goto("/clientes");
  await page.getByRole("button", { name: /^Ativos/ }).click();
  await page.getByRole("link", { name: "Pilates Corpo Leve" }).first().click();
  await page.waitForURL(/\/ficha\//);
  await expect(page.getByRole("link", { name: /Voltar pra Clientes/ })).toBeVisible();
  await expect(page.getByText("Voltar pra fila")).toHaveCount(0);
});
