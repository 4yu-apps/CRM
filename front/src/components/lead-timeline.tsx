"use client";
// Linha do tempo do lead: o que aconteceu, em ordem, numa lista so.
//
// Antes a ficha tinha o passado espalhado em tres lugares que nao se falavam: o
// "Historico do funil" (so mudanca de status), as Anotacoes (um textarea que a
// proxima edicao sobrescrevia) e o Follow-up. Quem quisesse a historia da conta
// montava de cabeca.
//
// Aqui as fontes se misturam de proposito. Fonte diferente vira icone diferente,
// nao secao diferente: separar por origem devolveria o problema que a tela veio
// resolver.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, PhoneCall, Handshake, ChatText, NotePencil, FileText, DotOutline,
  ArrowRight, Trash, X,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { STATUS_META, TONE_CLASSES } from "@/lib/state-machine";
import { fmtRelative, fmtDateTime, fromDateInput, todayInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityKind, LeadActivity, StatusHistory } from "@/lib/types";

const KINDS: { id: ActivityKind; label: string; Icon: typeof PhoneCall }[] = [
  { id: "ligacao", label: "Ligação", Icon: PhoneCall },
  { id: "reuniao", label: "Reunião", Icon: Handshake },
  { id: "mensagem", label: "Mensagem", Icon: ChatText },
  { id: "proposta", label: "Proposta", Icon: FileText },
  { id: "nota", label: "Nota", Icon: NotePencil },
  { id: "outro", label: "Outro", Icon: DotOutline },
];

const kindMeta = (k: ActivityKind) => KINDS.find((x) => x.id === k) ?? KINDS[KINDS.length - 1];

type Item =
  | { tipo: "status"; at: string; h: StatusHistory }
  | { tipo: "toque"; at: string; a: LeadActivity };

export function LeadTimeline({
  leadId,
  history,
  activities,
  onChanged,
}: {
  leadId: string;
  history: StatusHistory[];
  activities: LeadActivity[];
  onChanged: () => void | Promise<void>;
}) {
  const repo = getRepo();
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [kind, setKind] = useState<ActivityKind>("ligacao");
  const [texto, setTexto] = useState("");
  const [dia, setDia] = useState(todayInput);
  const [apagando, setApagando] = useState<string | null>(null);

  const itens = useMemo<Item[]>(() => {
    const a: Item[] = activities.map((x) => ({ tipo: "toque", at: x.happened_at, a: x }));
    const h: Item[] = history.map((x) => ({ tipo: "status", at: x.changed_at, h: x }));
    return [...a, ...h].sort((x, y) => +new Date(y.at) - +new Date(x.at));
  }, [activities, history]);

  const registrar = async () => {
    const body = texto.trim();
    if (!body) {
      toast.warning("Escreva o que aconteceu.");
      return;
    }
    setSalvando(true);
    try {
      // Hoje deixa o banco carimbar a hora real (now()). Data no passado vira
      // meio-dia local, pra nao escorregar de dia ao virar UTC.
      const hoje = dia === todayInput();
      const happened_at = hoje ? undefined : (fromDateInput(dia) ?? undefined);
      await repo.addActivity(leadId, { kind, body, happened_at });
      setTexto("");
      setDia(todayInput());
      setAbrindo(false);
      toast.success("Toque registrado.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar o toque");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (id: string) => {
    try {
      await repo.deleteActivity(id);
      setApagando(null);
      toast.success("Toque apagado.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao apagar o toque");
    }
  };

  return (
    <div className="border-t border-border p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[12px] font-bold uppercase tracking-wider text-faint">Linha do tempo</div>
        {!abrindo && (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="flex items-center gap-1.5 rounded-[12px] border border-brand bg-brand-50 px-3 py-1.5 text-[12.5px] font-bold text-brand"
          >
            <Plus size={13} weight="bold" /> Registrar toque
          </button>
        )}
      </div>

      {/* Formulario inline, nao modal: a ficha e longa e o toque e curto.
          Tres campos e um botao, sem tirar a pessoa do contexto que ela esta
          lendo pra decidir o que escrever. */}
      {abrindo && (
        <div className="mb-5 rounded-[14px] border border-brand-100 bg-surface-2 p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  kind === k.id
                    ? "border-brand bg-brand text-white"
                    : "border-border-2 bg-card text-ink-2 hover:border-brand/50",
                )}
              >
                <k.Icon size={13} weight={kind === k.id ? "fill" : "regular"} /> {k.label}
              </button>
            ))}
          </div>

          <textarea
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="O que aconteceu? Ex: falei com o Rafael, pediu proposta com 2 opções de escopo."
            className="w-full resize-none rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
                Quando
              </label>
              <input
                type="date"
                value={dia}
                max={todayInput()}
                onChange={(e) => setDia(e.target.value)}
                className="rounded-xl border border-border-2 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={registrar}
              disabled={salvando}
              className="rounded-[12px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--grad)" }}
            >
              {salvando ? "Salvando..." : "Registrar"}
            </button>
            <button
              type="button"
              onClick={() => { setAbrindo(false); setTexto(""); }}
              disabled={salvando}
              className="rounded-[12px] border border-border-2 px-3 py-2 text-sm font-semibold text-ink-2 disabled:opacity-50"
            >
              <X size={15} />
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-faint">
            Dá pra registrar hoje uma conversa de ontem: escolha a data que ela aconteceu.
          </p>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nada registrado ainda. Toda ligação e reunião que você anotar aqui fica sendo a memória da conta.
        </p>
      ) : (
        // Lista de eventos com semantica de lista: leitor de tela anuncia
        // quantos itens ha e navega item a item, em vez de ler um monte de div.
        <div role="list" aria-label="Linha do tempo" className="flex flex-col gap-0">
          {itens.map((item, i) => {
            const ultimo = i === itens.length - 1;
            const chave = item.tipo === "toque" ? item.a.id : item.h.id;
            const meta = item.tipo === "toque" ? kindMeta(item.a.kind) : null;
            const tone = item.tipo === "status" ? TONE_CLASSES[STATUS_META[item.h.to_status].tone] : "";

            return (
              <div key={chave} role="listitem" className="group flex gap-3.5 pb-4 last:pb-0">
                <div className="relative flex flex-col items-center">
                  <div
                    className={cn(
                      "mt-0.5 flex size-7 flex-none items-center justify-center rounded-full border",
                      item.tipo === "toque" ? "border-border-2 bg-surface-2 text-ink-2" : tone,
                    )}
                  >
                    {meta ? <meta.Icon size={14} weight="fill" /> : <ArrowRight size={13} weight="bold" />}
                  </div>
                  {!ultimo && <div className="mt-1 w-px flex-1 bg-border" />}
                </div>

                <div className="min-w-0 flex-1 pb-1 pt-0.5">
                  {item.tipo === "status" ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.h.from_status && (
                          <>
                            <span className="text-[12.5px] font-semibold text-muted-foreground">
                              {STATUS_META[item.h.from_status]?.label ?? item.h.from_status}
                            </span>
                            <ArrowRight size={13} className="text-faint" />
                          </>
                        )}
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider", tone)}>
                          {STATUS_META[item.h.to_status].label}
                        </span>
                        <span className="text-[11.5px] text-faint">
                          por {item.h.actor === "system" ? "sistema" : item.h.actor === "extension" ? "extensão" : "você"}
                        </span>
                      </div>
                      {item.h.note && <div className="mt-0.5 text-[13px] text-muted-foreground">{item.h.note}</div>}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-bold text-ink-2">{meta!.label}</span>
                        {apagando === item.a.id ? (
                          <span className="flex items-center gap-1.5 text-[11.5px]">
                            <span className="text-danger">Apagar esse toque?</span>
                            <button type="button" onClick={() => apagar(item.a.id)} className="font-bold text-danger hover:underline">
                              Sim
                            </button>
                            <button type="button" onClick={() => setApagando(null)} className="font-semibold text-ink-2 hover:underline">
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label="Apagar toque"
                            onClick={() => setApagando(item.a.id)}
                            // Visivel de cara no celular: la nao existe hover, e
                            // esconder atras dele deixava o toque impossivel de
                            // apagar no telefone. No desktop segue discreto,
                            // aparecendo ao passar o mouse ou pelo teclado.
                            className="text-faint transition-opacity hover:text-danger focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <Trash size={13} />
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">
                        {item.a.body}
                      </div>
                    </>
                  )}
                  <div className="mt-0.5 text-[11.5px] text-faint" title={item.at}>
                    {fmtRelative(item.at)} ({fmtDateTime(item.at)})
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
