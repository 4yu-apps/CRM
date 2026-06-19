"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { LeadsRepo } from "@/lib/repo";
import type { LeadEditable } from "@/lib/types";

const FIELDS: { key: keyof LeadEditable; label: string; required?: boolean }[] = [
  { key: "business_name", label: "Nome do negocio", required: true },
  { key: "phone", label: "Telefone" },
  { key: "cnpj", label: "CNPJ" },
  { key: "category", label: "Segmento" },
  { key: "city", label: "Cidade" },
  { key: "instagram", label: "Instagram" },
];

export function NewLeadDialog({
  repo,
  onCreated,
}: {
  repo: LeadsRepo;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadEditable>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof LeadEditable, v: string) =>
    setForm((f) => ({ ...f, [key]: v === "" ? null : v }));

  const submit = async () => {
    if (!form.business_name?.trim()) {
      toast.error("Nome do negocio e obrigatorio");
      return;
    }
    setBusy(true);
    try {
      const lead = await repo.create(form);
      toast.success("Lead criado");
      setForm({});
      setOpen(false);
      onCreated(lead.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Novo lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label, required }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {label}
                  {required && <span className="text-rose-500"> *</span>}
                </Label>
                <Input
                  value={(form[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Criando…" : "Criar lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
