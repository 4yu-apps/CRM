import { describe, it, expect, beforeAll } from "vitest";
import { applyMigrations } from "../../../scripts/schema-offline.mjs";

// Clientes e a ficha decidem "esse cliente esta em atraso?" lendo
// leads.paid_until, uma coluna DESNORMALIZADA mantida por trigger. Ela so se
// paga se nunca mentir, e a mentira mais cara aqui e a silenciosa: um cliente
// que aparece em dia por causa de um recebimento que foi apagado.
//
// Por isso o trigger e testado contra um Postgres de verdade (pglite), como o
// de last_activity_at, e nao no olho.

type DB = Awaited<ReturnType<typeof applyMigrations>>;
let db: DB;
let owner: string;

// Nome unico por lead: o banco tem indice unico em (owner_id, nome+endereco
// normalizados), entao dois "Teste" sem endereco colidiriam.
let seq = 0;
const novoLead = async (): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.leads (owner_id, business_name, status) values ($1, $2, 'fechado') returning id`,
    [owner, `Pagante ${++seq}`],
  );
  return r.rows[0].id;
};

const pagoAte = async (leadId: string): Promise<string | null> => {
  const r = await db.query<{ paid_until: string | Date | null }>(
    `select paid_until from public.leads where id = $1`,
    [leadId],
  );
  const v = r.rows[0].paid_until;
  if (v == null) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
};

const receber = async (
  leadId: string,
  amount: number,
  paidOn: string,
  coversUntil: string | null = null,
) => {
  await db.query(
    `insert into public.lead_payments (lead_id, amount, paid_on, covers_until)
     values ($1, $2, $3, $4)`,
    [leadId, amount, paidOn, coversUntil],
  );
};

beforeAll(async () => {
  db = await applyMigrations();
  const u = await db.query<{ id: string }>(
    `insert into auth.users (email) values ('pagador@teste.com') returning id`,
  );
  owner = u.rows[0].id;
}, 60_000);

describe("pago ate (leads.paid_until)", () => {
  it("nasce vazio: cliente sem recebimento nao finge estar em dia nem em atraso", async () => {
    expect(await pagoAte(await novoLead())).toBeNull();
  });

  it("um recebimento com cobertura preenche a coluna", async () => {
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    expect(await pagoAte(lead)).toBe("2026-09-05");
  });

  it("guarda a cobertura MAIS LONGE, mesmo se a antiga entrar depois", async () => {
    // Caso real: a pessoa registra hoje um pix que caiu mes passado. Isso nao
    // pode encurtar a cobertura ja registrada e fazer um cliente em dia
    // aparecer devendo.
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await receber(lead, 1500, "2026-07-05", "2026-08-05");
    expect(await pagoAte(lead)).toBe("2026-09-05");
  });

  it("recebimento avulso (sem cobertura) nao estende o contrato", async () => {
    // Um extra pago fora do contrato entra no total recebido, mas nao compra
    // mais um mes. Se estendesse, um servico avulso deixaria o cliente
    // "em dia" sem ter pago a mensalidade.
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await receber(lead, 400, "2026-08-10", null);
    expect(await pagoAte(lead)).toBe("2026-09-05");
  });

  it("apagar o recebimento mais recente volta pro anterior, sem data fantasma", async () => {
    const lead = await novoLead();
    await receber(lead, 1500, "2026-07-05", "2026-08-05");
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await db.query(
      `delete from public.lead_payments where lead_id = $1 and covers_until = '2026-09-05'`,
      [lead],
    );
    expect(await pagoAte(lead)).toBe("2026-08-05");
  });

  it("apagar o unico recebimento devolve a coluna pra vazio", async () => {
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await db.query(`delete from public.lead_payments where lead_id = $1`, [lead]);
    expect(await pagoAte(lead)).toBeNull();
  });

  it("corrigir a cobertura de um recebimento recalcula o pago ate", async () => {
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await db.query(
      `update public.lead_payments set covers_until = '2026-10-05' where lead_id = $1`,
      [lead],
    );
    expect(await pagoAte(lead)).toBe("2026-10-05");
  });

  it("um cliente nao mexe no pago ate do outro", async () => {
    const a = await novoLead();
    const b = await novoLead();
    await receber(a, 1500, "2026-08-05", "2026-09-05");
    expect(await pagoAte(b)).toBeNull();
  });
});

describe("o que a tabela recusa", () => {
  it("recebimento de zero e recusado: nao e recebimento", async () => {
    const lead = await novoLead();
    await expect(receber(lead, 0, "2026-08-05")).rejects.toThrow(/amount_pos/);
  });

  it("valor negativo e recusado: estorno e outra coisa, e ainda nao existe aqui", async () => {
    const lead = await novoLead();
    await expect(receber(lead, -100, "2026-08-05")).rejects.toThrow(/amount_pos/);
  });

  it("apagar o lead leva os recebimentos junto, sem deixar orfao", async () => {
    const lead = await novoLead();
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    await db.query(`delete from public.leads where id = $1`, [lead]);
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_payments where lead_id = $1`,
      [lead],
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe("historico do funil nao e poluido", () => {
  it("registrar recebimento nao inventa linha de mudanca de status", async () => {
    // O trigger de recebimento faz UPDATE em leads, e leads tem trigger de
    // historico. Se aquele nao guardasse "so quando o status muda", cada pix
    // registrado viraria um degrau falso no funil.
    const lead = await novoLead();
    const antes = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_status_history where lead_id = $1`,
      [lead],
    );
    await receber(lead, 1500, "2026-08-05", "2026-09-05");
    const depois = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_status_history where lead_id = $1`,
      [lead],
    );
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });
});

describe("RLS", () => {
  it("um dono nao enxerga o recebimento do outro", async () => {
    const outro = await db.query<{ id: string }>(
      `insert into auth.users (email) values ('outro-pagador@teste.com') returning id`,
    );
    const meu = await novoLead();
    await receber(meu, 1500, "2026-08-05", "2026-09-05");

    await db.exec("set role authenticated");
    await db.query(`select set_config('garimpo.test_uid', $1, false)`, [outro.rows[0].id]);
    const doOutro = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_payments`,
    );
    await db.query(`select set_config('garimpo.test_uid', $1, false)`, [owner]);
    const meuTotal = await db.query<{ n: number }>(
      `select count(*)::int n from public.lead_payments`,
    );
    await db.exec("reset role");

    expect(doOutro.rows[0].n).toBe(0);
    expect(meuTotal.rows[0].n).toBeGreaterThan(0);
  });
});
