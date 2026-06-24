"use client";
import { createContext, useContext, useEffect, useState } from "react";

// Tipos e constantes de locale
export type Locale = "pt" | "en" | "es";

export const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: "pt", label: "Portugues", flag: "BR" },
  { value: "en", label: "English", flag: "US" },
  { value: "es", label: "Espanol", flag: "ES" },
];

// Dicionario de traducoes. pt fica vazio: a chave ja e o texto nativo.
const DICT: Record<Locale, Record<string, string>> = {
  pt: {},
  en: {
    "nav./": "Home",
    "nav./fila": "Lead queue",
    "nav./funil": "Pipeline",
    "nav./contatos": "Contacts",
    "nav./agenda": "Calendar",
    "nav./resultados": "Results",
    "nav./buscar": "Prospect",
    "nav./celular": "On mobile",
    "nav./config": "Settings",
    "title./": "Overview",
    "sub./": "Your starting point for the day",
    "title./fila": "Lead queue",
    "sub./fila": "Review, tweak and approve",
    "title./funil": "Pipeline",
    "sub./funil": "Where each lead is now",
    "title./contatos": "Contacts",
    "sub./contatos": "Your whole base in one place",
    "title./agenda": "Calendar",
    "sub./agenda": "Your upcoming meetings",
    "title./resultados": "Results",
    "sub./resultados": "Is it paying off?",
    "title./buscar": "Prospect leads",
    "sub./buscar": "On demand, whenever you want",
    "title./celular": "On mobile",
    "sub./celular": "Track and send via WhatsApp",
    "title./config": "Settings",
    "sub./config": "Set it once, I handle the rest",
    "topbar.search": "Search contact...",
    "cfg.lang.title": "Language",
    "cfg.lang.sub": "Choose the system language.",
    "cfg.lang.note":
      "For now I translate the menu and titles. Internal screens remain in Portuguese and will be translated gradually.",
  },
  es: {
    "nav./": "Inicio",
    "nav./fila": "Cola de leads",
    "nav./funil": "Embudo",
    "nav./contatos": "Contactos",
    "nav./agenda": "Agenda",
    "nav./resultados": "Resultados",
    "nav./buscar": "Prospectar",
    "nav./celular": "En el movil",
    "nav./config": "Configuracion",
    "title./": "Vision general",
    "sub./": "Tu punto de partida del dia",
    "title./fila": "Cola de leads",
    "sub./fila": "Revisa, ajusta y aprueba",
    "title./funil": "Embudo",
    "sub./funil": "Donde esta cada lead ahora",
    "title./contatos": "Contactos",
    "sub./contatos": "Toda tu base en un solo lugar",
    "title./agenda": "Agenda",
    "sub./agenda": "Tus proximas reuniones",
    "title./resultados": "Resultados",
    "sub./resultados": "Vale la pena?",
    "title./buscar": "Prospectar leads",
    "sub./buscar": "Bajo comando, cuando quieras",
    "title./celular": "En el movil",
    "sub./celular": "Sigue y envia por WhatsApp",
    "title./config": "Configuracion",
    "sub./config": "Ajusta una vez, yo me encargo del resto",
    "topbar.search": "Buscar contacto...",
    "cfg.lang.title": "Idioma",
    "cfg.lang.sub": "Elige el idioma del sistema.",
    "cfg.lang.note":
      "Por ahora traduzco el menu y los titulos. Las pantallas internas siguen en portugues y se van traduciendo poco a poco.",
  },
};

// Funcao de traducao: tenta locale atual, cai pra pt, cai pra fallback, cai pra key.
function makeT(locale: Locale) {
  return (key: string, fallback?: string): string =>
    DICT[locale][key] ?? DICT.pt[key] ?? fallback ?? key;
}

// Contexto
type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
};

const LocaleContext = createContext<LocaleCtx | null>(null);

const STORAGE_KEY = "garimpo-locale";

function isValidLocale(v: unknown): v is Locale {
  return v === "pt" || v === "en" || v === "es";
}

// Provider que envolve o app e expoe locale/setLocale/t
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt");

  // Leitura inicial do localStorage (so no cliente)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidLocale(saved)) setLocaleState(saved);
    } catch {
      // sem acesso ao localStorage: continua em pt
    }
  }, []);

  // Atualiza o atributo lang do documento sempre que o locale muda
  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      // SSR ou ambiente sem DOM
    }
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // sem acesso ao localStorage: ignora
    }
  };

  const t = makeT(locale);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

// Hook principal: locale + setLocale + t
export function useLocale(): LocaleCtx {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fora do provider: retorna defaults seguros
    return { locale: "pt", setLocale: () => undefined, t: makeT("pt") };
  }
  return ctx;
}

// Atalho pra quem so precisa traduzir
export function useT(): (key: string, fallback?: string) => string {
  return useLocale().t;
}
