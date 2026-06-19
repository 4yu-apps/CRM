"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LeadsRepo } from "@/lib/repo";
import type { Lead, LeadDetail, LeadEditable, LeadStatus } from "@/lib/types";
import { fmtRelative } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { StatusActions } from "./status-actions";
import { DraftApproval } from "./draft-approval";
import { ProvenanceList } from "./provenance-list";
import { ScoreMeter } from "./score-meter";
import { HistoryTimeline } from "./history-timeline";

const EDIT_FIELDS: { key: keyof LeadEditable; label: string }[] = [
  { key: "business_name", label: "Nome do negocio" },
  { key: "phone", label: "Telefone" },
  { key: "cnpj", label: "CNPJ" },
  { key: "email", label: "E-mail" },
  { key: "instagram", label: "Instagram" },
  { key: "website", label: "Site" },
  { key: "owner_name", label: "Dono / responsavel" },
  { key: "category", label: "Segmento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function LeadDetailSheet({
  leadId,
  repo,
  onClose,
  onChanged,
}: {
  leadId: string | null;
  repo: LeadsRepo;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<LeadEditable>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setEdits({});
    setConfirmDelete(false);
    try {
      setDetail(await repo.detail(leadId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar lead");
    } finally {
      setLoading(false);
    }
  }, [leadId, repo]);

  useEffect(() => {
    // fetch-on-open: carrega o detalhe quando abre/troca de lead.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (leadId) void load();
    else setDetail(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [leadId, load]);

  const lead = detail?.lead;
  const dirty = Object.keys(edits).length > 0;

  const field = (key: keyof LeadEditable): string => {
    if (key in edits) return (edits[key] as string) ?? "";
    return ((lead?.[key as keyof Lead] as string | null) ?? "") || "";
  };
  const setField = (key: keyof LeadEditable, v: string) =>
    setEdits((e) => ({ ...e, [key]: v === "" ? null : v }));

  const saveEdits = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await repo.update(lead.id, edits);
      toast.success("Lead atualizado");
      setEdits({});
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const doTransition = async (to: LeadStatus, label: string) => {
    if (!lead) return;
    try {
      await repo.transition(lead.id, to, "human");
      toast.success(`Status: ${label}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transicao invalida");
    }
  };

  const saveDraft = async (msg1: string, msg2: string) => {
    if (!lead) return;
    await repo.update(lead.id, { draft_msg1: msg1, draft_msg2: msg2 });
    toast.success("Rascunho salvo");
    await load();
    onChanged();
  };

  const toggleOptOut = async (value: boolean) => {
    if (!lead) return;
    try {
      await repo.setOptOut(lead.id, value);
      toast.success(value ? "Marcado opt-out (LGPD)" : "Opt-out removido");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const doArchive = async () => {
    if (!lead) return;
    try {
      await repo.setArchived(lead.id, !lead.archived);
      toast.success(lead.archived ? "Lead desarquivado" : "Lead arquivado");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
    }
  };

  const doDelete = async () => {
    if (!lead) return;
    try {
      await repo.remove(lead.id);
      toast.success("Lead excluido");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const hasDraft =
    lead && ["rascunho_pronto", "aprovado", "enviado"].includes(lead.status) &&
    (lead.draft_msg1 || lead.draft_msg2);

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        {loading || !lead ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2 pr-6">
                <SheetTitle className="text-xl">{lead.business_name ?? "Sem nome"}</SheetTitle>
                <StatusBadge status={lead.status} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {lead.category && <span>{lead.category}</span>}
                {lead.city && <span>· {lead.city}/{lead.state}</span>}
                {lead.rating != null && (
                  <span className="inline-flex items-center gap-1">
                    · <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    {lead.rating} ({lead.reviews_count ?? 0})
                  </span>
                )}
                <span>· atualizado {fmtRelative(lead.updated_at)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-10">
              <Section title="Proximo passo">
                <StatusActions lead={lead} onTransition={doTransition} />
              </Section>

              {hasDraft && (
                <Section title="Rascunho: ver, editar, aprovar">
                  <DraftApproval
                    lead={lead}
                    onSaveDraft={saveDraft}
                    onApprove={() => doTransition("aprovado", "Aprovar")}
                  />
                </Section>
              )}

              {lead.score_reason && (
                <Section title="Score">
                  <ScoreMeter score={lead.score ?? lead.score_reason.total} reason={lead.score_reason} />
                </Section>
              )}

              <Section title="Dados do lead">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {EDIT_FIELDS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input value={field(key)} onChange={(e) => setField(key, e.target.value)} />
                    </div>
                  ))}
                </div>
                {dirty && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdits} disabled={saving}>
                      {saving ? "Salvando…" : "Salvar alteracoes"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdits({})}>
                      Descartar
                    </Button>
                  </div>
                )}
              </Section>

              <Section title="LGPD">
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">
                    Opt-out · nao contatar
                    <span className="block text-xs text-muted-foreground">
                      Bloqueia avancar para rascunho / aprovado / enviado.
                    </span>
                  </span>
                  <Switch checked={lead.opt_out} onCheckedChange={toggleOptOut} />
                </label>
              </Section>

              <Separator />

              <Section title="Proveniencia: quem achou o que">
                <ProvenanceList items={detail.provenance} />
              </Section>

              <Section title="Historico do funil">
                <HistoryTimeline items={detail.history} />
              </Section>

              <Separator />

              <Section title="Acoes">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={doArchive}>
                    {lead.archived ? (
                      <>
                        <ArchiveRestore className="size-4" /> Desarquivar
                      </>
                    ) : (
                      <>
                        <Archive className="size-4" /> Arquivar
                      </>
                    )}
                  </Button>

                  {!confirmDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="size-4" /> Excluir
                    </Button>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Excluir de vez?</span>
                      <Button
                        size="sm"
                        className="bg-rose-600 text-white hover:bg-rose-700"
                        onClick={doDelete}
                      >
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Cancelar
                      </Button>
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Arquivar tira da lista sem apagar (da pra voltar). Excluir apaga o lead e o
                  historico de vez.
                </p>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
