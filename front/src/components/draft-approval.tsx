"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

function DraftField({
  label,
  value,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={onCopy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="resize-none" />
    </div>
  );
}

// Fluxo "ver -> editar -> aprovar". O envio e SEMPRE manual (humano no loop):
// aqui o humano edita a copy, copia pro WhatsApp e aprova. Nada e enviado pelo sistema.
export function DraftApproval({
  lead,
  onSaveDraft,
  onApprove,
}: {
  lead: Lead;
  onSaveDraft: (msg1: string, msg2: string) => Promise<void> | void;
  onApprove: () => void;
}) {
  const [msg1, setMsg1] = useState(lead.draft_msg1 ?? "");
  const [msg2, setMsg2] = useState(lead.draft_msg2 ?? "");
  const dirty = msg1 !== (lead.draft_msg1 ?? "") || msg2 !== (lead.draft_msg2 ?? "");
  const [copied, setCopied] = useState<1 | 2 | null>(null);

  const copy = async (n: 1 | 2, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(n);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Nao consegui copiar");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <DraftField
        label="Mensagem 1 · abertura"
        value={msg1}
        onChange={setMsg1}
        onCopy={() => copy(1, msg1)}
        copied={copied === 1}
      />
      <DraftField
        label="Mensagem 2 · pitch"
        value={msg2}
        onChange={setMsg2}
        onCopy={() => copy(2, msg2)}
        copied={copied === 2}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!dirty} onClick={() => onSaveDraft(msg1, msg2)}>
          Salvar edicao
        </Button>
        {lead.status === "rascunho_pronto" && (
          <Button size="sm" onClick={onApprove} disabled={lead.opt_out}>
            Aprovar rascunho
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Envio e manual no WhatsApp, o sistema nunca dispara.
        </span>
      </div>
    </div>
  );
}
