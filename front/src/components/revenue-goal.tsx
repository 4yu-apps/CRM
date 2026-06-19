"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KEY = "garimpo:goal";

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function RevenueGoal({ fechados }: { fechados: number }) {
  const [ticket, setTicket] = useState(1500);
  const [meta, setMeta] = useState(15000);

  useEffect(() => {
    // hidrata da localStorage no cliente (default no SSR evita mismatch)
    /* eslint-disable react-hooks/set-state-in-effect */
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (typeof o.ticket === "number") setTicket(o.ticket);
      if (typeof o.meta === "number") setMeta(o.meta);
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = (t: number, m: number) => {
    setTicket(t);
    setMeta(m);
    localStorage.setItem(KEY, JSON.stringify({ ticket: t, meta: m }));
  };

  const receita = fechados * ticket;
  const progress = meta > 0 ? Math.min(1, receita / meta) : 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Meta de receita</h2>
        <span className="text-xs text-muted-foreground">{fechados} fechados · ticket {brl(ticket)}</span>
      </div>

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">{brl(receita)}</span>
        <span className="text-sm text-muted-foreground">de {brl(meta)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{Math.round(progress * 100)}% da meta</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ticket medio (R$/mes)</Label>
          <Input
            type="number"
            value={ticket}
            onChange={(e) => persist(Number(e.target.value) || 0, meta)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Meta (R$)</Label>
          <Input
            type="number"
            value={meta}
            onChange={(e) => persist(ticket, Number(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}
