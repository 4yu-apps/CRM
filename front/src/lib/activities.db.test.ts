import { describe, it, expect, beforeAll } from "vitest";
import { applyMigrations } from "../../../scripts/schema-offline.mjs";

// A tela de Contatos vai mostrar "ultimo toque" lendo leads.last_activity_at,
// uma coluna DESNORMALIZADA mantida por trigger. Desnormalizacao so se paga se
// ela nunca mentir, entao o trigger e testado contra um Postgres de verdade
// (pglite), nao no olho.

type DB = Awaited<ReturnType<typeof applyMigrations>>;
let db: DB;
let owner: string;

// Nome unico por lead: o banco tem indice unico em (owner_id, nome+endereco
// normalizados), entao dois "Teste" sem endereco colidiriam. O teste tropecou
// nisso primeiro, e foi assim que descobrimos o mesmo buraco no cadastro a mao.
let seq = 0;
const novoLead = async (): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.leads (owner_id, business_name) values ($1, $2) returning id`,
    [owner, `Teste ${++seq}`],
  );
  return r.rows[0].id;
};

const ultimoToque = async (leadId: string): Promise<Date | null> => {
  const r = await db.query<{ last_activity_at: Date | null }>(
    `select last_activity_at from public.leads where id = $1`,
    [leadId],
  );
  return r.rows[0].last_activity_at;
};

const registrar = async (leadId: string, quando: string, body = "liguei") => {
  await db.query(
    `insert into public.lead_activities (lead_id, kind, body, happened_at)
     values ($1, 'ligacao', $2, $3)`,
    [leadId, body, quando],
  );
};

beforeAll(async () => {
  db = await applyMigrations();
  const u = await db.query<{ id: string }>(
    `insert into auth.users (email) values ('dono@teste.com') returning id`,
  );
  owner = u.rows[0].id;
}, 60_000);

describe("ultimo toque (leads.last_activity_at)", () => {
  it("nasce vazio: lead sem toque nenhum nao finge ter sido tocado", async () => {
    expect(await ultimoToque(await novoLead())).toBeNull();
  });

  it("registrar um toque preenche a coluna", async () => {
    const lead = await novoLead();
    await registrar(lead, "2026-08-01T10:00:00Z");
    expect(await ultimoToque(lead)).not.toBeNull();
  });

  it("guarda o toque MAIS RECENTE, mesmo se o antigo for registrado depois", async () => {
    // Caso real: a pessoa registra hoje uma ligacao de semana passada. Isso nao
    // pode fazer a conta parecer mais fria do que esta.
    const lead = await novoLead();
    await registrar(lead, "2026-08-05T10:00:00Z");
    await registrar(lead, "2026-07-01T10:00:00Z"); // antigo, inserido por ultimo
    expect((await ultimoToque(lead))!.toISOString()).toContain("2026-08-05");
  });

  it("apagar o toque mais recente volta pro anterior, nao deixa data fantasma", async () => {
    const lead = await novoLead();
    await registrar(lead, "2026-07-01T10:00:00Z");
    await registrar(lead, "2026-08-05T10:00:00Z");
    await db.query(
      `delete from public.lead_activities where lead_id = $1 and happened_at = '2026-08-05T10:00:00Z'`,
      [lead],
    );
    expect((await ultimoToque(lead))!.toISOString()).toContain("2026-07-01");
  });

  it("apagar o unico toque devolve a coluna pra vazio", async () => {
    const lead = await novoLead();
    await registrar(lead, "2026-08-05T10:00:00Z");
    await db.query(`delete from public.lead_activities where lead_id = $1`, [lead]);
    expect(await ultimoToque(lead)).toBeNull();
  });

  it("corrigir a data de um toque recalcula o ultimo", async () => {
    const lead = await novoLead();
    await registrar(lead, "2026-08-05T10:00:00Z");
    await db.query(
      `update public.lead_activities set happened_at = '2026-09-09T10:00:00Z' where lead_id = $1`,
      [lead],
    );
    expect((await ultimoToque(lead))!.toISOString()).toContain("2026-09-09");
  });

  it("um lead nao mexe no ultimo toque do outro", async () => {
    const a = await novoLead();
    const b = await novoLead();
    await registrar(a, "2026-08-05T10:00:00Z");
    expect(await ultimoToque(b)).toBeNull();
  });
});

describe("o que a tabela recusa", () => {
  it("atividade vazia ou so espaco nao entra: viraria linha muda na timeline", async () => {
    const lead = await novoLead();
    await expect(registrar(lead, "2026-08-05T10:00:00Z", "   ")).rejects.toThrow(/body_check/);
  });

  it("tipo fora do catalogo e recusado", async () => {
    const lead = await novoLead();
    await expect(
      db.query(
        `insert into public.lead_activities (lead_id, kind, body) values ($1, 'inventado', 'x')`,
        [lead],
      ),
    ).rejects.toThrow(/kind_check/);
  });

  it("apagar o lead leva as atividades junto, sem deixar orfao", async () => {
    const lead = await novoLead();
    await registrar(lead, "2026-08-05T10:00:00Z");
    await db.query(`delete from public.leads where id = $1`, [lead]);
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_activities where lead_id = $1`,
      [lead],
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe("historico do funil nao e poluido", () => {
  it("registrar atividade nao inventa linha de mudanca de status", async () => {
    // O trigger de atividade faz UPDATE em leads, e leads tem trigger de
    // historico. Se aquele nao guardasse "so quando o status muda", cada
    // ligacao registrada viraria um degrau falso no funil.
    const lead = await novoLead();
    const antes = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_status_history where lead_id = $1`,
      [lead],
    );
    await registrar(lead, "2026-08-05T10:00:00Z");
    const depois = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_status_history where lead_id = $1`,
      [lead],
    );
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });
});

describe("RLS", () => {
  it("um dono nao enxerga a atividade do outro", async () => {
    const outro = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('outro@teste.com') returning id`,
    );
    const meu = await novoLead();
    await registrar(meu, "2026-08-05T10:00:00Z", "conversa minha");

    await db.exec("set role authenticated");
    await db.query(`select set_config('garimpo.test_uid', $1, false)`, [outro.rows[0].id]);
    const doOutro = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_activities`,
    );
    await db.query(`select set_config('garimpo.test_uid', $1, false)`, [owner]);
    const meuTotal = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_activities`,
    );
    await db.exec("reset role");

    expect(doOutro.rows[0].n).toBe(0);
    expect(meuTotal.rows[0].n).toBeGreaterThan(0);
  });
});
