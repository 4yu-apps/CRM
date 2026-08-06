import { test, expect, type Page } from "@playwright/test";

// Recebimentos: a diferenca entre "combinado" e "entrou na conta".
//
// Antes da Fatia 5 o CRM so sabia o primeiro, e mostrava ele como se fosse o
// segundo: um cliente de R$1.500 fechado em janeiro somava R$1.500 de MRR em
// agosto mesmo sem pagar desde marco.
//
// Cuidado ao mexer: `page.goto` ZERA o repo mock (ele vive na memoria do
// modulo). Depois do cadastro, so navegar clicando no menu, senao o cliente que
// acabou de nascer some no meio do teste.

async function cadastrarCliente(page: Page, nome: string, valor: string) {
  await page.goto("/contatos");
  await page.getByRole("button", { name: "Novo contato" }).click();
  await page.getByRole("button", { name: /Cliente que já tenho/ }).click();
  await page.getByPlaceholder("Ex: Barbearia do Léo").fill(nome);
  await page.getByPlaceholder("Ex: 1500").fill(valor);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/\/clientes/);
}

/**
 * Navega pelo menu, sem goto.
 *
 * O celular nao tem a barra lateral: so cinco itens cabem no rodape e o resto
 * mora atras do "Mais". Clientes e Resultados estao justamente nesse resto,
 * entao um teste que so clicasse no link deixaria de cobrir o caminho que o
 * dono realmente faz no telefone.
 */
async function irPara(page: Page, label: string, url: RegExp) {
  const link = page.getByRole("link", { name: label, exact: true });
  if (!(await link.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await link.click();
  await page.waitForURL(url);
}

/** Abre a ficha do cliente clicando, sem goto. */
async function abrirFicha(page: Page, nome: string) {
  await page.getByRole("button", { name: /^Ativos/ }).click();
  await page.getByRole("link", { name: nome }).first().click();
  await page.waitForURL(/\/ficha\//);
}

/** Preenche o formulario de recebimento e salva. */
async function receber(page: Page, valor: string, cobreAte: string) {
  await page.getByLabel("Quanto entrou (R$)").fill(valor);
  await page.getByLabel("Cobre até").fill(cobreAte);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
}

test("cliente sem recebimento registrado nao e cliente em atraso", async ({ page }) => {
  // A distincao que impede alarme falso em massa: no dia do deploy a carteira
  // inteira esta sem recebimento registrado, e nenhuma dessas contas deve
  // aparecer vermelha.
  await cadastrarCliente(page, "Nunca Cobrado ME", "1000");
  await abrirFicha(page, "Nunca Cobrado ME");

  await expect(page.getByRole("button", { name: "Registrar recebimento" })).toBeVisible();
  await expect(page.getByText(/sem pagar/)).toHaveCount(0);
});

test("registrar recebimento mostra ate quando o cliente esta pago", async ({ page }) => {
  await cadastrarCliente(page, "Paga em Dia Ltda", "1500");
  await abrirFicha(page, "Paga em Dia Ltda");

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receber(page, "1500", "2099-12-31");

  await expect(page.getByText(/Pago até 31 de dez\. de 2099/)).toBeVisible();
  await expect(page.getByText("R$ 1.500,00 recebido no total")).toBeVisible();
});

test("o valor digitado no jeito brasileiro entra certo", async ({ page }) => {
  // O bug que a Fatia 1 matou no negocio, cobrado aqui de novo no recebimento:
  // `parseFloat("2.500,00".replace(",","."))` gravava R$ 2,50.
  await cadastrarCliente(page, "Ponto e Virgula ME", "2500");
  await abrirFicha(page, "Ponto e Virgula ME");

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receber(page, "2.500,00", "2099-12-31");

  await expect(page.getByText("R$ 2.500,00 recebido no total")).toBeVisible();
});

test("cobertura vencida vira alerta na ficha e na carteira", async ({ page }) => {
  await cadastrarCliente(page, "Sumiu o Pix ME", "900");
  await abrirFicha(page, "Sumiu o Pix ME");

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receber(page, "900", "2020-01-31"); // cobertura ja vencida ha anos

  await expect(page.getByText(/sem pagar/).first()).toBeVisible();

  // E a carteira concorda: o alerta de dinheiro vem antes de tudo na aba
  // Atencao, e o total em atraso aparece no cabecalho.
  await irPara(page, "Clientes", /\/clientes/);
  await expect(page.getByRole("button", { name: /^Atenção/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/sem pagar/).first()).toBeVisible();
  await expect(page.getByText("em atraso")).toBeVisible();
});

test("apagar um recebimento devolve a cobertura anterior, sem data fantasma", async ({ page }) => {
  await cadastrarCliente(page, "Digitei Errado ME", "700");
  await abrirFicha(page, "Digitei Errado ME");

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receber(page, "700", "2099-12-31");
  await expect(page.getByText(/Pago até 31 de dez\. de 2099/)).toBeVisible();

  const apagar = page.getByRole("button", { name: /Remover recebimento de R\$ 700,00/ });
  // O Playwright clica em elemento transparente sem reclamar, entao o clique
  // sozinho passaria com o botao invisivel pro usuario. Cobra a opacidade, e
  // cobra CONTRATOS DIFERENTES: no celular nao existe hover, entao a lixeira
  // tem que nascer visivel; no desktop ela e afordancia revelada, e ficar
  // sempre acesa poluiria a lista. Foi assim que um botao ficou inalcancavel no
  // celular antes.
  if (page.viewportSize()!.width < 640) {
    await expect(apagar).toHaveCSS("opacity", "1");
  } else {
    await expect(apagar).toHaveCSS("opacity", "0");
    await apagar.hover();
    await expect(apagar).toHaveCSS("opacity", "1");
  }
  await apagar.click();

  await expect(page.getByText(/Pago até/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar recebimento" })).toBeVisible();
});

test("Resultados mostra recebido do lado de contratado", async ({ page }) => {
  await cadastrarCliente(page, "Aparece em Resultados ME", "1300");
  await abrirFicha(page, "Aparece em Resultados ME");

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receber(page, "1300", "2099-12-31");
  await expect(page.getByText(/Pago até/)).toBeVisible();

  await irPara(page, "Resultados", /\/resultados/);

  // Os dois numeros na mesma seccao de proposito: separados por telas
  // diferentes, o que a pessoa lembra e sempre o maior.
  await expect(page.getByText("MRR contratado")).toBeVisible();
  const recebido = page.getByText("Recebido este mês").locator("..");
  await expect(recebido).toContainText("R$ 1.300");
});
