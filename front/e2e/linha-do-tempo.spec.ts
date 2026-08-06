import { test, expect } from "@playwright/test";

// A linha do tempo e o que separa "planilha bonita" de CRM de gestao: sem ela o
// sistema sabe que o funil andou, mas nao sabe o que foi conversado. Estes
// testes cobrem o caminho inteiro, da ficha vazia ate o "ultimo toque" mudando
// na lista de Contatos.

async function abrirPrimeiraFicha(page: import("@playwright/test").Page) {
  // Entra por Clientes: la o nome e um <a> de verdade. Em Contatos a linha e
  // clicavel sem ser link, entao getByRole("link") nao acha.
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Pilates Corpo Leve" }).first().click();
  await page.waitForURL(/\/ficha\//);
}

test("registrar um toque coloca ele no topo da linha do tempo", async ({ page }) => {
  await abrirPrimeiraFicha(page);

  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByRole("button", { name: "Ligação" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("Falei com a Camila, pediu proposta nova.");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();

  await expect(page.getByText("Falei com a Camila, pediu proposta nova.")).toBeVisible();
  await expect(page.getByText("Toque registrado.")).toBeVisible();
});

test("a linha do tempo mistura status e toque numa lista so", async ({ page }) => {
  // O ponto da tela: fonte diferente vira icone diferente, nao secao diferente.
  await abrirPrimeiraFicha(page);
  const secao = page.getByRole("list", { name: "Linha do tempo" });

  // O lead semeado ja passou pelo funil, entao o historico de status esta la.
  await expect(secao.getByText("Fechado").first()).toBeVisible();

  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("Reuniao aconteceu, socio gostou do case.");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();

  await expect(secao.getByText("Reuniao aconteceu, socio gostou do case.")).toBeVisible();
  await expect(secao.getByText("Fechado").first()).toBeVisible();
});

test("da pra registrar hoje uma conversa de ontem", async ({ page }) => {
  await abrirPrimeiraFicha(page);
  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("Liguei semana passada, ficou de responder.");

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const iso = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
  await page.locator('input[type="date"]').first().fill(iso);
  await page.getByRole("button", { name: "Registrar", exact: true }).click();

  // "ontem" pelo formatador relativo, e nao "agora": a data escolhida vale.
  await expect(page.getByText("Liguei semana passada, ficou de responder.")).toBeVisible();
  await expect(page.getByText(/ontem/i).first()).toBeVisible();
});

test("apagar um toque pede confirmacao antes", async ({ page }) => {
  await abrirPrimeiraFicha(page);
  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("Toque pra apagar.");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Toque pra apagar.")).toBeVisible();

  const lixeira = page.getByRole("button", { name: "Apagar toque" }).first();
  // No celular nao existe hover: se a lixeira so aparecesse ao passar o mouse, o
  // toque seria impossivel de apagar no telefone. O Playwright clica em elemento
  // transparente sem reclamar, entao a opacidade precisa ser checada na mao.
  if (page.viewportSize()!.width < 640) {
    const opacidade = await lixeira.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacidade), "lixeira invisivel no celular").toBeGreaterThan(0.5);
  }
  await lixeira.click();
  await expect(page.getByText("Apagar esse toque?")).toBeVisible();
  // Desistir mantem o toque.
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText("Toque pra apagar.")).toBeVisible();

  await lixeira.click();
  await page.getByRole("button", { name: "Sim", exact: true }).click();
  await expect(page.getByText("Toque pra apagar.")).toHaveCount(0);
});

test("toque vazio nao entra: viraria linha muda na timeline", async ({ page }) => {
  await abrirPrimeiraFicha(page);
  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("   ");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Escreva o que aconteceu.")).toBeVisible();
});

test("o ultimo toque aparece na lista de Contatos", async ({ page }) => {
  // A coluna le leads.last_activity_at, mantida por trigger no banco. Se o valor
  // nao chegar ate a lista, a desnormalizacao nao serviu pra nada.
  //
  // Conta quantos "sem toque" existem antes e depois, em vez de mirar a linha:
  // a lista de Contatos e um grid de divs, sem semantica de tabela, entao
  // qualquer seletor de linha aqui seria refem de classe CSS.
  await page.goto("/contatos");
  // Espera a lista existir antes de contar: os leads chegam depois do primeiro
  // render, entao contar na hora daria zero e o teste falharia sem motivo.
  await expect(page.getByText("Pilates Corpo Leve").first()).toBeVisible();
  const semToque = page.getByText("sem toque");
  const antes = await semToque.count();
  expect(antes, "o cenario exige alguem sem toque pra medir").toBeGreaterThan(0);

  await page.getByText("Pilates Corpo Leve").first().click();
  await page.waitForURL(/\/ficha\//);
  await page.getByRole("button", { name: "Registrar toque" }).click();
  await page.getByPlaceholder(/O que aconteceu/).fill("Toque de hoje, pra lista ver.");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Toque de hoje, pra lista ver.")).toBeVisible();

  // Navega CLICANDO, nao com goto: o repo mock vive na memoria do modulo, entao
  // um reload zeraria o toque e o teste passaria pelo motivo errado.
  await page.getByRole("link", { name: "Contatos", exact: true }).click();
  await page.waitForURL(/\/contatos/);
  await expect(semToque).toHaveCount(antes - 1);
});
