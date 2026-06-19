"use client";
import { useCallback, useEffect, useState } from "react";
import { getRepo } from "@/lib/repo";
import type { Lead } from "@/lib/types";

export function useLeads() {
  const repo = getRepo();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLeads(await repo.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    // fetch-on-mount: setState ocorre apos await (assincrono). Trocar por
    // React Query / Server Components numa fase futura.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { leads, loading, error, refresh, repo };
}
