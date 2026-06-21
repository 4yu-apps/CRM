// Route Handler (Next.js 16) que dispara o robo de captacao na hora.
//
// O front nao busca leads sozinho: quem garimpa e o workflow do GitHub Actions
// (esteira.yml). Este endpoint so chuta o workflow via API ("workflow_dispatch")
// pra busca comecar agora, em vez de esperar o proximo ciclo do cron.
//
// Degrada com graca: nunca lanca erro pro cliente. Sempre devolve { ok, ... }.
// Se faltar o token (GITHUB_DISPATCH_TOKEN), devolve { ok:false, reason:'sem_token' }
// e a UI mostra um aviso ameno (o robo busca no proximo ciclo). POST nao e
// cacheado pelo Next por padrao.

// Sempre dinamico e no runtime nodejs: fala com a API do GitHub no servidor,
// o token nunca chega ao navegador.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface OkResult {
  ok: true;
}

interface FailResult {
  ok: false;
  reason: string;
}

const DISPATCH_URL =
  "https://api.github.com/repos/4yu-apps/CRM/actions/workflows/esteira.yml/dispatches";

function fail(reason: string): Response {
  // status 200 de proposito: "erro" de negocio, nao de transporte. A UI le o
  // reason e escolhe o aviso certo sem jogar erro vermelho.
  return Response.json({ ok: false, reason } satisfies FailResult);
}

export async function POST(): Promise<Response> {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) {
    // Token sera configurado na Vercel por outro fluxo. Sem ele, nao quebra:
    // o robo ainda busca no proximo ciclo do cron.
    return fail("sem_token");
  }

  let res: Response;
  try {
    res = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "garimpo",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });
  } catch {
    // Rede caiu ao falar com o GitHub: o alvo ja foi salvo, robo pega depois.
    return fail("falha_rede");
  }

  // GitHub responde 204 No Content quando o dispatch entra na fila.
  if (res.status === 204) {
    return Response.json({ ok: true } satisfies OkResult);
  }

  // 401/403 = token invalido ou sem permissao. 404 = repo/workflow nao achado.
  if (res.status === 401 || res.status === 403) {
    return fail("token_invalido");
  }
  if (res.status === 404) {
    return fail("workflow_nao_encontrado");
  }

  return fail("github_erro");
}
