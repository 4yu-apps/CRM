"use client";
// Cadastro a mao de um contato.
//
// Ate aqui, a unica porta de entrada manual era importar CSV: quem quisesse
// registrar UM negocio tinha que montar planilha. E quem ja tinha cliente nao
// tinha porta nenhuma, porque "cliente" no sistema e um lead em 'fechado', e a
// maquina de estados so anda um passo por vez: seriam cinco arrastes de coluna
// pra registrar alguem que ja assinou contrato.
//
// Por isso o formulario pergunta primeiro o que a pessoa esta cadastrando. As
// duas respostas levam a lugares bem diferentes:
//
//   lead     -> nasce em 'bruto', a esteira enriquece, pontua e rascunha
//   cliente  -> nasce em 'fechado', com valor, e aparece em Clientes
//
// Nascer direto em 'fechado' e legitimo: o gatilho que valida a maquina de
// estados no banco e BEFORE UPDATE, nao INSERT. Um lead pode nascer em qualquer
// estado; o que ele nao pode e pular entre estados depois.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, UserPlus, Handshake, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { parseBRL, fromDateInput, todayInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RAMOS_DISPONIVEIS } from "@/lib/ramos";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { Dropdown, type DropdownOption } from "@/components/dropdown";
import type { DealBilling, Lead, LeadCreate } from "@/lib/types";

type Intent = "lead" | "cliente";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const RAMO_OPTIONS: DropdownOption[] = RAMOS_DISPONIVEIS.map((r) => ({ value: r, label: r }));

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function NewContactModal({
  onClose,
  onCreated,
  existing,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  // Base ja carregada pela tela de Contatos. Serve pra avisar do repetido ANTES
  // de tentar salvar: o banco tem indice unico em (owner_id, phone_normalized) e
  // devolveria um "duplicate key value violates unique constraint" cru, que nao
  // diz a quem pergunta que ele ja tem esse contato.
  existing: Lead[];
}) {
  const repo = getRepo();
  const router = useRouter();

  const [intent, setIntent] = useState<Intent>("lead");
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [ramo, setRamo] = useState("");

  const [valor, setValor] = useState("");
  const [billing, setBilling] = useState<DealBilling>("mensal_fixo");
  const [meses, setMeses] = useState("");
  // Default hoje, mas editavel de proposito. Cliente que a pessoa ja tem foi
  // fechado ANTES de existir cadastro aqui; carimbar hoje faria a renovacao de um
  // contrato de 12 meses assinado ha 8 avisar daqui a um ano, e ninguem ia
  // desconfiar do alerta ate perder o cliente.
  const [fechadoEm, setFechadoEm] = useState(todayInput);

  const valorLido = parseBRL(valor);

  // Repetido por telefone (so digitos). Numero curto ainda esta sendo digitado,
  // entao so acusa a partir de 10 digitos (DDD + numero), pra nao piscar aviso a
  // cada tecla.
  const duplicadoFone = useMemo(() => {
    const d = digits(whatsapp);
    if (d.length < 10) return null;
    return existing.find((l) => digits(l.phone) === d || digits(l.whatsapp) === d) ?? null;
  }, [whatsapp, existing]);

  // Repetido por NOME. O banco tem indice unico em (dono, nome + endereco
  // normalizados) e este formulario nao pede endereco, entao dois contatos de
  // mesmo nome colidem: duas unidades da mesma franquia, por exemplo. Sem este
  // aviso o dono levava um "duplicate key violates unique constraint" cru.
  const duplicadoNome = useMemo(() => {
    const n = nome.trim().toLowerCase();
    if (n.length < 3) return null;
    return existing.find((l) => (l.business_name ?? "").trim().toLowerCase() === n) ?? null;
  }, [nome, existing]);

  const duplicado = duplicadoFone ?? duplicadoNome;

  const salvar = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      toast.warning("Diga pelo menos o nome do negócio.");
      return;
    }
    const fone = whatsapp.trim();
    const mail = email.trim();

    // Sem nenhum canal, um lead pra prospectar morre na esteira: o score
    // descarta "sem telefone e sem e-mail, nao da pra contatar", e a pessoa
    // nunca entende por que o cadastro dela sumiu da fila. Barrar aqui e mais
    // honesto que deixar cadastrar e engolir depois. O cliente que ja existe nao
    // passa por isso: ele nao vai ser prospectado.
    if (intent === "lead" && !fone && !mail) {
      toast.warning("Pra prospectar preciso de um canal: WhatsApp ou e-mail.");
      return;
    }
    if (duplicadoFone) {
      toast.warning(`Esse WhatsApp já é de ${duplicadoFone.business_name ?? "um contato seu"}.`);
      return;
    }
    if (duplicadoNome) {
      toast.warning(`Você já tem um contato chamado "${nomeLimpo}".`);
      return;
    }

    let deal: Partial<LeadCreate> = {};
    if (intent === "cliente") {
      if (valor.trim()) {
        if (valorLido == null || valorLido <= 0) {
          toast.warning("Valor do contrato inválido.");
          return;
        }
        let termMonths: number | null = null;
        if (billing === "por_prazo") {
          const m = Number.parseInt(meses, 10);
          if (!Number.isFinite(m) || m <= 0) {
            toast.warning("Contrato por prazo precisa do número de meses.");
            return;
          }
          termMonths = m;
        }
        const dataIso = fromDateInput(fechadoEm);
        if (!dataIso) {
          toast.warning("Data do fechamento inválida.");
          return;
        }
        deal = {
          deal_value: valorLido,
          deal_billing: billing,
          deal_term_months: termMonths,
          deal_closed_at: dataIso,
        };
      }
    }

    setSaving(true);
    try {
      const lead = await repo.create({
        business_name: nomeLimpo,
        whatsapp: fone || null,
        // O telefone tambem recebe o zap: e o campo que a ficha, o funil e a
        // extensao leem pra montar o link do WhatsApp.
        phone: fone || null,
        email: mail || null,
        city: cidade || null,
        state: uf || null,
        category: ramo || null,
        manual: true,
        ...(intent === "cliente" ? { status: "fechado" as const } : {}),
        ...deal,
      });
      await onCreated();
      onClose();
      if (intent === "cliente") {
        toast.success(`${nomeLimpo} entrou na sua base de clientes.`);
        router.push("/clientes");
      } else {
        toast.success("Contato cadastrado. O robô vai completar o que faltar.");
        router.push(`/ficha/${lead.id}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cadastrar o contato";
      // Rede de seguranca: a checagem acima usa a lista ja carregada, que pode
      // estar velha (outra aba, a esteira rodando). Se o indice unico do banco
      // pegar, o erro vem em ingles falando de constraint; traduz.
      toast.error(
        /leads_owner_name_addr_uniq/i.test(msg)
          ? "Você já tem um contato com esse nome. Procure por ele na lista."
          : /duplicate key|unique constraint|leads_owner_(cnpj|phone)_uniq/i.test(msg)
            ? "Você já tem um contato com esse telefone. Procure por ele na lista."
            : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={() => { if (!saving) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-4 backdrop-blur-[2px] sm:p-6"
    >
      {/* Teto de altura + miolo rolante, com cabecalho e rodape fixos. Sem isso,
          num notebook de 768px o formulario com contrato por prazo empurra o
          botao Salvar pra fora da tela, e nada na tela conta que da pra rolar. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-[460px] max-w-full flex-col overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
        style={{ animation: "fadeUp .25s both" }}
      >
        <div className="flex flex-none items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-brand-50 text-brand">
              <UserPlus size={20} weight="fill" />
            </div>
            <div>
              <div className="text-base font-bold">Novo contato</div>
              <div className="text-[12.5px] text-muted-foreground">Cadastro rápido, o resto dá pra completar depois</div>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {/* A pergunta que muda tudo. Fica no topo porque decide o destino do
              registro, e nao no fim como um detalhe. */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              O que ele é pra você
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  { id: "lead", Icon: MagnifyingGlass, titulo: "Lead pra prospectar", sub: "o robô completa e escreve a abordagem" },
                  { id: "cliente", Icon: Handshake, titulo: "Cliente que já tenho", sub: "entra direto na sua base de clientes" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIntent(opt.id)}
                  className={cn(
                    "flex flex-1 flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    intent === opt.id
                      ? "border-brand bg-brand-50"
                      : "border-border-2 bg-surface-2 hover:border-brand/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[13px] font-bold",
                      intent === opt.id ? "text-brand" : "text-ink-2",
                    )}
                  >
                    <opt.Icon size={15} weight="bold" /> {opt.titulo}
                  </span>
                  <span className="text-[11.5px] leading-snug text-muted-foreground">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <Campo label="Nome do negócio">
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Barbearia do Léo"
              className={inputCls}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="WhatsApp">
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                inputMode="tel"
                placeholder="(44) 99999-0000"
                className={inputCls}
              />
            </Campo>
            <Campo label="E-mail">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="contato@empresa.com"
                className={inputCls}
              />
            </Campo>
          </div>
          {intent === "lead" && !whatsapp.trim() && !email.trim() && (
            <p className="-mt-2 text-[11.5px] text-faint">
              Preencha um dos dois. Sem canal de contato o robô descarta o lead, e você não ia entender por quê.
            </p>
          )}
          {duplicado && (
            <div className="-mt-2 flex items-start gap-2 rounded-[12px] border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Warning size={15} weight="fill" className="mt-0.5 flex-none" />
              <span>
                {duplicadoFone ? "Esse WhatsApp já é de " : "Você já tem um contato chamado "}
                <strong>{duplicado.business_name ?? "um contato seu"}</strong>.{" "}
                <Link href={`/ficha/${duplicado.id}`} onClick={onClose} className="font-semibold underline">
                  Abrir a ficha
                </Link>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Cidade">
              <CityAutocomplete
                cidade={cidade}
                uf={uf}
                onSelect={(sel) => { setCidade(sel.cidade); setUf(sel.uf); }}
                onClear={() => { setCidade(""); setUf(""); }}
                placeholder="Digite a cidade..."
                ariaLabel="Cidade do contato"
              />
            </Campo>
            <Campo label="Ramo">
              <Dropdown
                value={ramo}
                onChange={setRamo}
                options={RAMO_OPTIONS}
                placeholder="Escolher ramo"
                ariaLabel="Ramo do contato"
                searchable
              />
            </Campo>
          </div>

          {/* Valor so faz sentido pra quem ja fechou. Pra um lead, o preco ainda
              nao existe: quem sugere e a IA, depois do enriquecimento. */}
          {intent === "cliente" && (
            <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface-2 p-4">
              <Campo label="Quanto você cobra (opcional)">
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex: 1500"
                  className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                />
                {valorLido != null && valorLido > 0 && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Vou salvar <strong className="text-ink">{fmtBRL(valorLido)}</strong>
                  </p>
                )}
              </Campo>

              {valor.trim() !== "" && (
                <>
                  <Campo label="Tipo de cobrança">
                    <div className="flex gap-2">
                      {(["mensal_fixo", "por_prazo"] as DealBilling[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setBilling(opt)}
                          className={cn(
                            "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                            billing === opt
                              ? "border-brand bg-brand-50 text-brand"
                              : "border-border-2 bg-card text-ink-2 hover:border-brand/50",
                          )}
                        >
                          {opt === "mensal_fixo" ? "Mensal fixo" : "Por prazo"}
                        </button>
                      ))}
                    </div>
                  </Campo>
                  {billing === "por_prazo" && (
                    <Campo label="Meses de contrato" hint="É daqui que sai o alerta de renovação em Clientes.">
                      <input
                        type="number"
                        min={1}
                        value={meses}
                        onChange={(e) => setMeses(e.target.value)}
                        placeholder="Ex: 6"
                        className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                      />
                    </Campo>
                  )}
                  {/* Cliente que ja existe foi fechado antes de existir cadastro
                      aqui. Carimbar hoje adiantaria a renovacao em meses. */}
                  <Campo label="Fechado em" hint="Se foi antes de hoje, ajuste. A renovação conta a partir daqui.">
                    <input
                      type="date"
                      value={fechadoEm}
                      onChange={(e) => setFechadoEm(e.target.value)}
                      max={todayInput()}
                      className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                    />
                  </Campo>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-none gap-3 border-t border-border px-6 py-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-[14px] border border-border-2 bg-card p-3.5 text-sm font-semibold text-ink-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="flex-1 rounded-[14px] p-3.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--grad)" }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
