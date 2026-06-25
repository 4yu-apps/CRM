"use client";
import { useCallback, useEffect, useState } from "react";

// Detecta se a extensao do CRM esta presente na aba. O sinal vem do
// crm-bridge.mjs da extensao, que seta data-garimpo-ext="1" no <html> e posta
// { source: "garimpo-ext", type: "ready", version } via window.postMessage.
// Unico ponto de verdade no front sobre presenca da extensao.

export interface ExtensionState {
  // null = ainda verificando; true = presente; false = ausente (apos timeout)
  installed: boolean | null;
  version: string | null;
}

const SIGNAL_ATTR = "data-garimpo-ext";
const VERSION_ATTR = "data-garimpo-ext-version";
// Janela pra extensao se anunciar antes de cravar "ausente". O crm-bridge roda
// em document_idle, entao pode marcar presenca depois do primeiro paint do React.
const TIMEOUT_MS = 1200;

function readSignal(): { present: boolean; version: string | null } {
  if (typeof document === "undefined") return { present: false, version: null };
  const el = document.documentElement;
  return {
    present: el.getAttribute(SIGNAL_ATTR) === "1",
    version: el.getAttribute(VERSION_ATTR) || null,
  };
}

export function useExtension(): ExtensionState & { recheck: () => void } {
  const [state, setState] = useState<ExtensionState>({ installed: null, version: null });
  // recheck re-arma o effect (botao "ja instalei" no badge).
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let settled = false;

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data as { source?: string; type?: string; version?: unknown } | null;
      if (!d || d.source !== "garimpo-ext" || d.type !== "ready") return;
      settled = true;
      setState({ installed: true, version: typeof d.version === "string" && d.version ? d.version : null });
    };
    window.addEventListener("message", onMessage);

    // Leitura imediata (timer 0 pra nao chamar setState no corpo do effect):
    // cobre a extensao que ja tinha marcado presenca antes do React montar.
    const immediate = window.setTimeout(() => {
      const { present, version } = readSignal();
      if (present) {
        settled = true;
        setState({ installed: true, version });
      }
    }, 0);

    // Veredito final: sem sinal ate aqui, considera ausente.
    const verdict = window.setTimeout(() => {
      if (settled) return;
      const { present, version } = readSignal();
      setState(present ? { installed: true, version } : { installed: false, version: null });
    }, TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(immediate);
      window.clearTimeout(verdict);
    };
  }, [nonce]);

  const recheck = useCallback(() => {
    setState({ installed: null, version: null });
    setNonce((n) => n + 1);
  }, []);

  return { ...state, recheck };
}
