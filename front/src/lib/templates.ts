// #18 — Templates de mensagem: variaveis e substituicao. {nome} usa o contato
// (owner_name) com fallback pro nome do negocio; {ramo}/{bairro}/{cidade} saem
// dos campos do lead. fillSample da o preview sem precisar de um lead real.
import type { Lead, MessageTemplateKind } from "./types";

export const TEMPLATE_KIND_LABEL: Record<MessageTemplateKind, string> = {
  abertura: "Abertura",
  follow_up: "Follow-up",
  objecao: "Quebra de objeção",
  reativacao: "Reativação",
};

export const TEMPLATE_KINDS: MessageTemplateKind[] = ["abertura", "follow_up", "objecao", "reativacao"];

export const TEMPLATE_VARS = ["{nome}", "{ramo}", "{bairro}", "{cidade}"];

export function fillTemplate(body: string, lead: Lead): string {
  const nome = lead.owner_name?.split(" ")[0] || lead.business_name || "";
  return body
    .replaceAll("{nome}", nome)
    .replaceAll("{ramo}", lead.category ?? "")
    .replaceAll("{bairro}", lead.neighborhood ?? "")
    .replaceAll("{cidade}", lead.city ?? "");
}

export function fillSample(body: string): string {
  return body
    .replaceAll("{nome}", "João")
    .replaceAll("{ramo}", "barbearia")
    .replaceAll("{bairro}", "Centro")
    .replaceAll("{cidade}", "Maringá");
}
