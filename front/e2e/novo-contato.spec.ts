import { test, expect } from "@playwright/test";

// Cadastro a mao: as duas intencoes, os dois avisos e o negocio na ficha.
//
// Cada teste aqui nasceu de um problema real, nao de cobertura por cobertura.
// O que este roteiro ja pegou, rodando pela primeira vez: o botao Salvar caia
// fora da tela num notebook de 768px quando o formulario abria o contrato por
// prazo. O fundo rolava, mas nada contava isso, entao era um modal sem saida.

test.beforeEach(async ({ page }) => {
  await page.goto("/contatos");
  await page.getByRole("button", { name: "Novo contato" }).click();
});

test("o botao Salvar fica visivel com o formulario todo aberto", async ({ page }, info) => {
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: 1500").fill("2500");
  await page.getByRole("button", { name: "Por prazo" }).click();

  const salvar = page.getByRole("button", { name: "Salvar", exact: true });
  await expect(salvar).toBeInViewport();

  const caixa = await salvar.boundingBox();
  const altura = page.viewportSize()!.height;
  expect(caixa!.y + caixa!.height, `Salvar passou da dobra em ${info.project.name}`).toBeLessThanOrEqual(altura);
});

test("valor digitado no jeito brasileiro nao vira um milesimo do que era", async ({ page }) => {
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: 1500").fill("2.500,00");
  // O eco existe pra ambiguidade nenhuma sobrar pro banco resolver.
  await expect(page.getByText("Vou salvar")).toContainText("R$ 2.500,00");
});

test("avisa antes de salvar quando o WhatsApp ja e de outro contato", async ({ page }) => {
  // Numero do lead semeado "Pilates Corpo Leve". O banco tem indice unico em
  // (owner_id, phone_normalized) e devolveria erro cru de constraint.
  await page.getByPlaceholder("(44) 99999-0000").fill("44996607733");
  const aviso = page.getByText(/já é de/);
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Pilates Corpo Leve");
  await expect(page.getByRole("link", { name: "Abrir a ficha" })).toBeVisible();
});

test("lead pra prospectar sem canal nenhum e barrado na hora", async ({ page }) => {
  // Sem telefone e sem e-mail a esteira descarta, e a pessoa nunca entende por
  // que o cadastro dela sumiu da fila. Barrar aqui e mais honesto.
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill("Sem Contato Ltda");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText(/preciso de um canal/i)).toBeVisible();
  await expect(page).toHaveURL(/\/contatos/);
});

test("cliente que ja existe entra direto na base, sem passar pelo funil", async ({ page }) => {
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill("Doceria da Ana");
  await page.getByPlaceholder("Ex: 1500").fill("1.800,00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect(page).toHaveURL(/\/clientes/);
  await expect(page.getByRole("link", { name: "Doceria da Ana" }).first()).toBeVisible();
  await expect(page.getByText("R$ 1.800").first()).toBeVisible();
});

test("cliente salvo sem valor ganha o convite pra registrar na ficha", async ({ page }) => {
  // Da pra chegar em 'fechado' sem valor por varios caminhos, inclusive pelo
  // botao Fechar da extensao, que nunca pergunta quanto foi. Antes disso,
  // nenhuma tela avisava que faltava dinheiro ali.
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill("Sem Valor Ainda");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/clientes/);

  await page.getByRole("link", { name: "Sem Valor Ainda" }).first().click();
  await expect(page).toHaveURL(/\/ficha\//);
  await expect(page.getByText(/não registrou o valor/i)).toBeVisible();

  await page.getByRole("button", { name: "Registrar valor" }).click();
  await page.getByPlaceholder("Ex: 1500").fill("990");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("R$ 990,00").first()).toBeVisible();
});
