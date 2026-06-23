"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";

/* =============================================================================
   Landing page do 4YU CRM — conversao fiel do design Claude (Landing.dc.html).
   - estilos do design via <style> (CSS vars + classes + keyframes)
   - fontes Google (Plus Jakarta Sans + Space Grotesk) via <link>
   - icones Phosphor WEB (<i class="ph ph-...">) via next/script
   - sc-for expandidos em .map(), dados inline abaixo
   - FAQ accordion (useState) + .reveal (IntersectionObserver) com fallback
   Copy/numeros/precos sao do CLIENTE: mantidos EXATAMENTE como no design.
   ========================================================================== */

// --- dados inline (do renderVals() do design) -------------------------------

const navLinks = [
  { label: "Como funciona", href: "#como" },
  { label: "Recursos", href: "#recursos" },
  { label: "Planos", href: "#planos" },
  { label: "Dúvidas", href: "#faq" },
];

const trustStats = [
  { n: "+12 mil", l: "negócios garimpados" },
  { n: "53%", l: "de taxa de resposta" },
  { n: "0", l: "leads repetidos" },
];

const pains = [
  {
    ic: "magnifying-glass",
    t: "Horas no Google Maps",
    d: "Procurar negócio bom um por um, copiar telefone, conferir se já não falou antes. Tempo que não volta.",
  },
  {
    ic: "arrows-clockwise",
    t: "Sempre os mesmos contatos",
    d: "Sem controle, você acaba abordando quem já disse não, ou pior, quem já é seu cliente.",
  },
  {
    ic: "pencil-line",
    t: "Mensagem na pressa",
    d: "No fim do dia, cansado, a abordagem sai genérica e fria. E aí a resposta não vem.",
  },
];

const steps = [
  {
    n: "1",
    ic: "magnifying-glass",
    t: "A gente acha",
    d: "Varre o mapa e a internet atrás de negócios que precisam de tráfego na sua região.",
  },
  {
    n: "2",
    ic: "identification-card",
    t: "Monta a ficha",
    d: "Completa com dono, contato, reputação, site e os sinais de que vale a pena.",
  },
  {
    n: "3",
    ic: "sparkle",
    t: "Explica o porquê",
    d: "Te diz, em português claro, por que aquele lead é um bom alvo pra você.",
  },
  {
    n: "4",
    ic: "paper-plane-tilt",
    t: "Escreve a abordagem",
    d: "Entrega a primeira mensagem pronta. Você revisa e manda no WhatsApp.",
  },
];

interface Feature {
  ic: string;
  t: string;
  d: string;
  bg: string;
  icBg: string;
  icCol: string;
  tCol: string;
  dCol: string;
}

const features: Feature[] = [
  {
    ic: "tray",
    t: "Fila pronta todo dia",
    d: "Você abre o painel e já tem leads revisáveis esperando. Aprova ou descarta num clique, ou até no teclado.",
    bg: "var(--soft)",
    icBg: "#fff",
    icCol: "var(--brand)",
    tCol: "var(--ink)",
    dCol: "var(--muted)",
  },
  {
    ic: "sparkle",
    t: "O motivo, em português",
    d: "Nada de pontuação misteriosa. Cada lead vem com uma explicação simples de por que ele bate com você.",
    bg: "var(--grad)",
    icBg: "rgba(255,255,255,.18)",
    icCol: "#fff",
    tCol: "#fff",
    dCol: "rgba(255,255,255,.9)",
  },
  {
    ic: "map-trifold",
    t: "Busca por região no satélite",
    d: "Escolhe o bairro e vê no mapa o que já foi coberto. A varredura é em ordem, sem buraco.",
    bg: "var(--soft)",
    icBg: "#fff",
    icCol: "var(--brand)",
    tCol: "var(--ink)",
    dCol: "var(--muted)",
  },
  {
    ic: "funnel",
    t: "Funil que você arrasta",
    d: "Acompanhe cada lead do primeiro contato ao fechamento. Mudou de estágio? Arrasta o card.",
    bg: "var(--soft)",
    icBg: "#fff",
    icCol: "var(--brand)",
    tCol: "var(--ink)",
    dCol: "var(--muted)",
  },
  {
    ic: "whatsapp-logo",
    t: "Envio na sua mão",
    d: "A mensagem sai do seu número, no seu tempo. O 4YU CRM nunca dispara nada sozinho.",
    bg: "var(--soft)",
    icBg: "#fff",
    icCol: "var(--wa)",
    tCol: "var(--ink)",
    dCol: "var(--muted)",
  },
  {
    ic: "shield-check",
    t: "Sem repetir, com LGPD",
    d: "Cada negócio aparece uma vez só, e só usamos fontes públicas. Seus dados, protegidos.",
    bg: "var(--soft)",
    icBg: "#fff",
    icCol: "var(--brand)",
    tCol: "var(--ink)",
    dCol: "var(--muted)",
  },
];

const regionPoints = [
  {
    ic: "path",
    t: "Cobertura em ordem",
    d: "A gente varre bairro por bairro, sem pular pedaço nem deixar buraco na sua região.",
  },
  {
    ic: "eye",
    t: "Você vê o que falta",
    d: "No mapa de satélite dá pra acompanhar o que já foi coberto e o que ainda não.",
  },
  {
    ic: "target",
    t: "Busca sob comando",
    d: "Quer focar num ramo e numa zona específica agora? Pede e a gente busca na hora.",
  },
];

const zoneBars = [
  { n: "Zona 7", p: 100, css: "100%" },
  { n: "Centro", p: 72, css: "72%" },
  { n: "Zona Sul", p: 20, css: "20%" },
];

const bigStats = [
  { n: "+12 mil", l: "negócios garimpados" },
  { n: "53%", l: "taxa média de resposta" },
  { n: "4x", l: "mais rápido que na mão" },
  { n: "0", l: "lead repetido" },
];

const testimonials = [
  {
    q: "Eu perdia umas duas horas por dia caçando contato. Hoje abro o painel e já tá tudo lá, com a mensagem pronta. Virou meu primeiro café da manhã.",
    in: "CM",
    nome: "Carla Menezes",
    cargo: "Gestora de tráfego, Maringá",
  },
  {
    q: "O melhor é o motivo escrito do jeito que eu falo. Eu olho, entendo na hora por que aquele negócio é bom, e mando. Minha taxa de resposta subiu demais.",
    in: "RD",
    nome: "Rodrigo Dias",
    cargo: "Freelancer de tráfego, Curitiba",
  },
  {
    q: "Atendo uns 15 clientes e a parte de achar lead novo era um inferno. Com o 4YU CRM minha equipe parou de garimpar e passou a vender. Mudou o jogo.",
    in: "JP",
    nome: "Juliana Prado",
    cargo: "Dona de agência, São Paulo",
  },
];

interface Plan {
  nome: string;
  preco: string;
  sub: string;
  popular: boolean;
  feats: string[];
  cta: string;
  accent: string;
  priceCol: string;
  mutedCol: string;
  featCol: string;
  cardStyle: CSSProperties;
  btnStyle: CSSProperties;
}

const plans: Plan[] = [
  {
    nome: "Começo",
    preco: "R$197",
    sub: "Pra quem tá começando a prospectar com método.",
    popular: false,
    feats: [
      "Até 60 leads novos por mês",
      "Ficha completa de cada negócio",
      "Mensagem pronta pra cada lead",
      "1 cidade",
    ],
    cta: "Começar",
    accent: "var(--brand)",
    priceCol: "var(--ink)",
    mutedCol: "var(--muted)",
    featCol: "var(--ink-2)",
    cardStyle: {
      position: "relative",
      background: "#fff",
      border: "1px solid var(--border)",
      borderRadius: 20,
      padding: "32px 28px",
      boxShadow: "var(--shadow)",
      display: "flex",
      flexDirection: "column",
    },
    btnStyle: {
      marginTop: "auto",
      textAlign: "center",
      background: "var(--soft)",
      color: "var(--brand-700)",
      border: "1px solid var(--border-2)",
      borderRadius: 12,
      padding: 14,
      fontSize: 14.5,
      fontWeight: 700,
    },
  },
  {
    nome: "Profissional",
    preco: "R$397",
    sub: "O mais usado. Volume e região pra encher a agenda.",
    popular: true,
    feats: [
      "Até 200 leads novos por mês",
      "Busca por região no satélite",
      "Funil completo de acompanhamento",
      "Até 3 cidades",
      "Suporte prioritário no WhatsApp",
    ],
    cta: "Quero esse",
    accent: "#fff",
    priceCol: "#fff",
    mutedCol: "rgba(255,255,255,.82)",
    featCol: "rgba(255,255,255,.95)",
    cardStyle: {
      position: "relative",
      background: "var(--grad)",
      color: "#fff",
      border: "none",
      borderRadius: 20,
      padding: "32px 28px",
      boxShadow: "var(--shadow-lg)",
      display: "flex",
      flexDirection: "column",
      transform: "scale(1.02)",
    },
    btnStyle: {
      marginTop: "auto",
      textAlign: "center",
      background: "#fff",
      color: "var(--brand-700)",
      border: "none",
      borderRadius: 12,
      padding: 14,
      fontSize: 14.5,
      fontWeight: 700,
    },
  },
  {
    nome: "Agência",
    preco: "R$897",
    sub: "Pra quem atende vários clientes e precisa de escala.",
    popular: false,
    feats: [
      "Leads sem limite",
      "Cidades sem limite",
      "Vários gestores na conta",
      "Relatórios de resultado",
      "Gerente de conta dedicado",
    ],
    cta: "Falar com a gente",
    accent: "var(--brand)",
    priceCol: "var(--ink)",
    mutedCol: "var(--muted)",
    featCol: "var(--ink-2)",
    cardStyle: {
      position: "relative",
      background: "#fff",
      border: "1px solid var(--border)",
      borderRadius: 20,
      padding: "32px 28px",
      boxShadow: "var(--shadow)",
      display: "flex",
      flexDirection: "column",
    },
    btnStyle: {
      marginTop: "auto",
      textAlign: "center",
      background: "var(--soft)",
      color: "var(--brand-700)",
      border: "1px solid var(--border-2)",
      borderRadius: 12,
      padding: 14,
      fontSize: 14.5,
      fontWeight: 700,
    },
  },
];

const faqList = [
  {
    q: "De onde vêm os leads?",
    a: "A gente varre fontes públicas da internet, como mapas e redes sociais, e junta tudo numa ficha só: dados do negócio, contato, reputação e sinais de que ele precisa de tráfego. Nada de lista comprada ou contato frio sem contexto.",
  },
  {
    q: "O 4YU CRM manda mensagem sozinho?",
    a: "Não, e isso é de propósito. A gente escreve a primeira mensagem pra você, mas quem envia é você, do seu próprio número, na hora que quiser. Você fica no controle do relacionamento o tempo todo.",
  },
  {
    q: "Vou receber o mesmo lead duas vezes?",
    a: "Nunca. O sistema marca tudo que já te mostrou. Cada negócio aparece uma vez só, então você não perde tempo com repetição nem fala duas vezes com a mesma pessoa.",
  },
  {
    q: "Funciona pra qualquer cidade?",
    a: "Funciona pra qualquer cidade do Brasil. Você define a cidade e os bairros, e a gente cobre a região em ordem, sem pular pedaço. Dá pra acompanhar no mapa de satélite o que já foi varrido.",
  },
  {
    q: "Preciso assinar contrato longo?",
    a: "Não. Sem fidelidade e sem multa. Você assina, usa, e cancela quando quiser direto pelo painel. O primeiro garimpo costuma sair no mesmo dia.",
  },
  {
    q: "Meus dados e dos leads ficam seguros?",
    a: "Sim. Seguimos a LGPD, usamos só fontes públicas e você pode pedir a exclusão dos seus dados quando quiser. Tem tudo detalhado na nossa Política de Privacidade.",
  },
];

const socials = ["instagram-logo", "youtube-logo", "linkedin-logo"];

const footProduct = [
  { label: "Como funciona", href: "#como" },
  { label: "Recursos", href: "#recursos" },
  { label: "Planos", href: "#planos" },
  { label: "Dúvidas", href: "#faq" },
];

// CSS do design (CSS vars + classes + keyframes). Vai num <style> dentro do
// componente. Escopo das vars fica no .lp-root pra nao colidir com o app.
const LANDING_CSS = `
.lp-root{
  --bg:#FFFFFF; --soft:#F7F5FC; --soft-2:#F1ECFA; --ink:#160E29; --ink-2:#3B3354;
  --muted:#6B6483; --faint:#A39CB5; --border:#ECE7F5; --border-2:#E0D9F0;
  --brand:#7C3AED; --brand-600:#6D28D9; --brand-700:#581CA0; --brand-50:#F4EEFE; --brand-100:#E9DEFB;
  --grad:linear-gradient(135deg,#9D5BE8 0%,#6D28D9 60%,#531CA0 100%);
  --grad-soft:linear-gradient(135deg,#F7F0FE,#EFE6FC);
  --ring:rgba(124,58,237,.18);
  --wa:#1FAE54; --success:#16A05A;
  --shadow:0 1px 3px rgba(40,18,90,.06);
  --shadow-md:0 10px 30px rgba(50,24,100,.10);
  --shadow-lg:0 28px 64px rgba(50,24,100,.18);
  background:var(--bg);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
  color:var(--ink);
  -webkit-font-smoothing:antialiased;
}
.lp-root *{box-sizing:border-box}
.lp-root .ph{line-height:1}
.lp-root .wrap{max-width:1180px;margin:0 auto;padding:0 28px}
.lp-root a{color:inherit;text-decoration:none}
@keyframes lp-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes lp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
@keyframes lp-sheen{from{transform:translateX(-120%)}to{transform:translateX(260%)}}
.lp-root .reveal{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.lp-root .reveal.in{opacity:1;transform:none}
.lp-root .btn-primary{display:inline-flex;align-items:center;gap:9px;background:var(--grad);color:#fff;border:none;border-radius:999px;padding:15px 26px;font-size:15.5px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px var(--ring);transition:transform .18s,box-shadow .18s}
.lp-root .btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 32px var(--ring)}
.lp-root .btn-ghost{display:inline-flex;align-items:center;gap:9px;background:#fff;color:var(--brand-700);border:1px solid var(--border-2);border-radius:999px;padding:15px 26px;font-size:15.5px;font-weight:700;cursor:pointer;transition:background .18s,border-color .18s}
.lp-root .btn-ghost:hover{background:var(--soft);border-color:var(--brand)}
.lp-root .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--brand);background:var(--brand-50);padding:8px 15px;border-radius:999px}
.lp-root .h2{font-family:'Space Grotesk',sans-serif;font-size:42px;font-weight:700;letter-spacing:-.025em;line-height:1.08;color:var(--ink)}
.lp-root .lead{font-size:18px;color:var(--muted);line-height:1.6}
.lp-root .nav-link:hover{color:var(--brand)}
.lp-root .foot-link:hover{color:#fff}
.lp-root .social-link:hover{background:var(--brand);color:#fff}
@media (max-width:920px){
  .lp-root .hero-grid{grid-template-columns:1fr !important;}
  .lp-root .grid-2{grid-template-columns:1fr !important;}
  .lp-root .grid-3{grid-template-columns:1fr !important;}
  .lp-root .grid-4{grid-template-columns:1fr 1fr !important;}
  .lp-root .foot-grid{grid-template-columns:1fr 1fr !important;}
  .lp-root .h1-hero{font-size:40px !important;}
  .lp-root .h2{font-size:32px !important;}
}
`;

// --- componente --------------------------------------------------------------

export function Landing() {
  const [openFaq, setOpenFaq] = useState(0);

  // .reveal: IntersectionObserver que adiciona 'in'; fallback ~1.6s forca tudo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    const scan = () => {
      document.querySelectorAll(".lp-root .reveal:not(.in)").forEach((el) => io.observe(el));
    };
    const t1 = setTimeout(scan, 60);
    const t2 = setTimeout(scan, 400);
    const t3 = setTimeout(scan, 1000);
    const safety = setTimeout(() => {
      document
        .querySelectorAll(".lp-root .reveal:not(.in)")
        .forEach((el) => el.classList.add("in"));
    }, 1600);
    return () => {
      io.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(safety);
    };
  }, []);

  return (
    <div className="lp-root" style={{ overflowX: "hidden" }}>
      {/* fontes (Plus Jakarta Sans + Space Grotesk) ja sao carregadas no root
          layout via next/font e expostas pelo nome de familia; o design CSS as
          referencia por nome, entao nao precisa de <link> externo aqui. */}
      {/* icones Phosphor WEB */}
      <Script src="https://unpkg.com/@phosphor-icons/web@2.1.1" strategy="afterInteractive" />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      {/* ===== NAV ===== */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255,255,255,.82)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="wrap"
          style={{
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a href="#topo" style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Image
              src="/4yu-icon.png"
              alt="4YU CRM"
              width={38}
              height={38}
              style={{ width: 38, height: 38, objectFit: "contain" }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 3,
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>4YU</span>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".14em", color: "var(--brand)" }}>
                CRM
              </span>
            </div>
          </a>
          <nav style={{ display: "flex", alignItems: "center", gap: 30 }} className="lp-nav">
            {navLinks.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="nav-link"
                style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-2)" }}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/login"
              className="nav-link"
              style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-2)" }}
            >
              Entrar
            </Link>
            <Link href="/login" className="btn-primary" style={{ padding: "11px 20px", fontSize: 14.5 }}>
              Quero usar
            </Link>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section
        id="topo"
        style={{
          position: "relative",
          background:
            "radial-gradient(1200px 520px at 80% -10%,#F2E9FE 0%,rgba(255,255,255,0) 60%),radial-gradient(900px 500px at 0% 0%,#F6EFFE 0%,rgba(255,255,255,0) 55%)",
        }}
      >
        <div
          className="wrap hero-grid"
          style={{
            padding: "74px 28px 88px",
            display: "grid",
            gridTemplateColumns: "1.04fr .96fr",
            gap: 54,
            alignItems: "center",
          }}
        >
          <div>
            <div className="eyebrow reveal" style={{ marginBottom: 22 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  animation: "lp-pulse 1.8s infinite",
                }}
              />{" "}
              Prospecção no automático pra gestor de tráfego
            </div>
            <h1
              className="reveal h1-hero"
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: "-.03em",
                margin: "0 0 22px",
              }}
            >
              Pare de garimpar cliente.
              <br />
              <span
                style={{
                  background: "var(--grad)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Comece a fechar.
              </span>
            </h1>
            <p className="reveal lead" style={{ maxWidth: 520, margin: "0 0 32px" }}>
              O 4YU CRM acha negócios que precisam de você, monta a ficha completa, te diz por que valem a
              pena e ainda escreve a primeira mensagem. Você só revisa, aprova e manda no WhatsApp.
            </p>
            <div
              className="reveal"
              style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 30 }}
            >
              <Link href="/login" className="btn-primary">
                Começar agora <i className="ph ph-arrow-right" style={{ fontSize: 17 }} />
              </Link>
              <a href="#como" className="btn-ghost">
                <i className="ph ph-play-circle" style={{ fontSize: 18 }} /> Ver como funciona
              </a>
            </div>
            <div
              className="reveal"
              style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  color: "var(--muted)",
                  fontWeight: 600,
                }}
              >
                <i className="ph ph-check-circle" style={{ fontSize: 18, color: "var(--success)" }} /> Sem
                repetir lead, nunca
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  color: "var(--muted)",
                  fontWeight: 600,
                }}
              >
                <i className="ph ph-check-circle" style={{ fontSize: 18, color: "var(--success)" }} /> Você
                no controle do envio
              </div>
            </div>
          </div>

          {/* hero visual: app frame */}
          <div className="reveal" style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: -26,
                background: "var(--grad)",
                filter: "blur(60px)",
                opacity: 0.18,
                borderRadius: "50%",
              }}
            />
            <div
              style={{
                position: "relative",
                borderRadius: 20,
                background: "#fff",
                boxShadow: "var(--shadow-lg)",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  height: 38,
                  background: "var(--soft)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 14px",
                }}
              >
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#E0786B" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#E8B65C" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#7BC47F" }} />
                <div
                  style={{
                    marginLeft: 12,
                    flex: 1,
                    height: 20,
                    borderRadius: 6,
                    background: "#fff",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    fontSize: 11,
                    color: "var(--faint)",
                    fontWeight: 600,
                  }}
                >
                  app.4yumkt.com
                </div>
              </div>
              <div style={{ padding: 18, background: "linear-gradient(160deg,#FBFAFE,#F4EFFD)" }}>
                <div
                  style={{
                    borderRadius: 16,
                    background: "var(--grad)",
                    color: "#fff",
                    padding: "20px 22px",
                    marginBottom: 14,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      right: -30,
                      top: -40,
                      width: 150,
                      height: 150,
                      borderRadius: "50%",
                      border: "1.5px solid rgba(255,255,255,.2)",
                    }}
                  />
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: ".04em" }}>
                    BOM DIA, RAFA
                  </div>
                  <div
                    style={{
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                      lineHeight: 1.15,
                      margin: "7px 0 4px",
                    }}
                  >
                    Já tem 6 leads bons
                    <br />
                    te esperando.
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#fff",
                      color: "var(--brand-700)",
                      borderRadius: 999,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      marginTop: 10,
                    }}
                  >
                    Revisar a fila <i className="ph ph-arrow-right" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 11 }}>
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid var(--border)",
                      borderRadius: 13,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: "var(--brand-50)",
                          color: "var(--brand)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 15,
                        }}
                      >
                        <i className="ph ph-hamburger" />
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Burguer do Tonho</div>
                        <div style={{ fontSize: 10.5, color: "var(--faint)" }}>Zona 7 · nota 4,7</div>
                      </div>
                    </div>
                    <div
                      style={{
                        background: "var(--brand-50)",
                        borderRadius: 9,
                        padding: "9px 10px",
                        fontSize: 10.5,
                        color: "var(--ink-2)",
                        lineHeight: 1.45,
                      }}
                    >
                      Movimento alto e ainda não anuncia. Bate no seu perfil.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 13,
                        padding: 13,
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Meta do mês</div>
                      <div
                        style={{
                          fontFamily: "'Space Grotesk',sans-serif",
                          fontSize: 22,
                          fontWeight: 700,
                          lineHeight: 1.1,
                        }}
                      >
                        3
                        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}> /5</span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 9,
                          background: "var(--soft-2)",
                          marginTop: 7,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{ width: "60%", height: "100%", background: "var(--grad)", borderRadius: 9 }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 13,
                        padding: 13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>Respostas</span>
                      <span style={{ fontSize: 18, fontWeight: 700 }}>18</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* floating chip */}
            <div
              style={{
                position: "absolute",
                left: -26,
                bottom: 38,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 14,
                boxShadow: "var(--shadow-md)",
                padding: "13px 15px",
                display: "flex",
                alignItems: "center",
                gap: 11,
                animation: "lp-floaty 5s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--wa)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 19,
                }}
              >
                <i className="ph ph-whatsapp-logo" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Mensagem pronta</div>
                <div style={{ fontSize: 10.5, color: "var(--faint)" }}>é só você mandar</div>
              </div>
            </div>
          </div>
        </div>

        {/* trust strip */}
        <div style={{ borderTop: "1px solid var(--border)", background: "rgba(255,255,255,.6)" }}>
          <div
            className="wrap"
            style={{
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 40,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--faint)",
              }}
            >
              Quem usa, para de perder tempo
            </span>
            {trustStats.map((t) => (
              <div key={t.l} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span
                  style={{
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--brand)",
                  }}
                >
                  {t.n}
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)", maxWidth: 120, lineHeight: 1.25 }}>
                  {t.l}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROBLEMA ===== */}
      <section style={{ padding: "96px 0", background: "#fff" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 56px" }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-warning-circle" style={{ fontSize: 15 }} /> O problema de sempre
            </div>
            <h2 className="h2 reveal">
              Você é pago pra rodar anúncio.
              <br />
              Não pra ficar caçando contato.
            </h2>
            <p className="lead reveal" style={{ marginTop: 18 }}>
              Mas a conta não fecha: prospectar bem dá tanto trabalho que sobra pouco tempo pra fazer o que
              você faz de melhor.
            </p>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
            {pains.map((p) => (
              <div
                key={p.t}
                className="reveal"
                style={{
                  background: "var(--soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: "28px 26px",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: "#fff",
                    border: "1px solid var(--border)",
                    color: "#C9456A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 23,
                    marginBottom: 16,
                  }}
                >
                  <i className={`ph ph-${p.ic}`} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 7 }}>{p.t}</div>
                <div style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}>{p.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMO FUNCIONA ===== */}
      <section id="como" style={{ padding: "96px 0", background: "var(--grad-soft)" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 60px" }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-path" style={{ fontSize: 15 }} /> Como funciona
            </div>
            <h2 className="h2 reveal">Quatro passos. O trabalho pesado é nosso.</h2>
            <p className="lead reveal" style={{ marginTop: 18 }}>
              Da varredura à conversa, o 4YU CRM entrega tudo pronto. Você entra só onde importa: na decisão
              e no relacionamento.
            </p>
          </div>
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
            {steps.map((s) => (
              <div
                key={s.n}
                className="reveal"
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: "26px 24px",
                  boxShadow: "var(--shadow)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--brand)",
                    background: "var(--brand-50)",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--grad)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    marginBottom: 14,
                  }}
                >
                  <i className={`ph ph-${s.ic}`} />
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 7 }}>{s.t}</div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="recursos" style={{ padding: "96px 0", background: "#fff" }}>
        <div className="wrap">
          <div style={{ maxWidth: 640, margin: "0 0 56px" }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-stack" style={{ fontSize: 15 }} /> Tudo num lugar só
            </div>
            <h2 className="h2 reveal">
              Mais que uma lista de contatos. Um time de prospecção que não dorme.
            </h2>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
            {features.map((f) => (
              <div
                key={f.t}
                className="reveal"
                style={{
                  background: f.bg,
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: "28px 26px",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    background: f.icBg,
                    color: f.icCol,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    marginBottom: 16,
                  }}
                >
                  <i className={`ph ph-${f.ic}`} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: f.tCol }}>{f.t}</div>
                <div style={{ fontSize: 14.5, color: f.dCol, lineHeight: 1.55 }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== REGIÃO ===== */}
      <section style={{ padding: "96px 0", background: "var(--soft)" }}>
        <div
          className="wrap grid-2"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 54, alignItems: "center" }}
        >
          <div>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-map-trifold" style={{ fontSize: 15 }} /> Busca por região
            </div>
            <h2 className="h2 reveal">Diz a região. A gente varre o mapa inteiro.</h2>
            <p className="lead reveal" style={{ margin: "18px 0 26px" }}>
              Escolhe o ramo, a cidade e o bairro. O 4YU CRM cobre a área em ordem, sem pular pedaço e sem
              repetir quem você já viu. Dá pra acompanhar no satélite o que já foi varrido e o que falta.
            </p>
            <div className="reveal" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {regionPoints.map((r) => (
                <div key={r.t} style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: "var(--brand-50)",
                      color: "var(--brand)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      flex: "none",
                    }}
                  >
                    <i className={`ph ph-${r.ic}`} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r.t}</div>
                    <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{r.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal" style={{ position: "relative" }}>
            <div
              style={{
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "var(--shadow-lg)",
                border: "1px solid var(--border)",
                background: "#fff",
                padding: 14,
              }}
            >
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "linear-gradient(150deg,#2C3E50,#1A2733)",
                  height: 280,
                  position: "relative",
                }}
              >
                {/* stylized map */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)",
                    backgroundSize: "30px 30px",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "22%",
                    top: "30%",
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: "rgba(124,58,237,.45)",
                    border: "2px solid #9D5BE8",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "48%",
                    top: "46%",
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: "rgba(124,58,237,.4)",
                    border: "2px solid #9D5BE8",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "30%",
                    top: "58%",
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    background: "rgba(157,91,232,.28)",
                    border: "2px solid #B98DF0",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: "14%",
                    top: "24%",
                    width: 50,
                    height: 50,
                    borderRadius: "50%",
                    background: "rgba(180,178,196,.2)",
                    border: "2px dashed #b9b2c4",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    bottom: 14,
                    background: "rgba(20,12,40,.7)",
                    backdropFilter: "blur(6px)",
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontSize: 11,
                    color: "#fff",
                    display: "flex",
                    gap: 13,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: "#7C3AED" }} />
                    Coberto
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: "#b9b2c4" }} />
                    Ainda não
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 6px 6px" }}>
                {zoneBars.map((z) => (
                  <div key={z.n}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12.5,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{z.n}</span>
                      <span style={{ color: "var(--faint)" }}>{z.p}%</span>
                    </div>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 9,
                        background: "var(--soft-2)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: z.css,
                          background: "var(--grad)",
                          borderRadius: 9,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== RESULTADOS ===== */}
      <section
        style={{
          padding: "90px 0",
          background: "var(--grad)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -60,
            top: -60,
            width: 320,
            height: 320,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,.14)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -80,
            bottom: -90,
            width: 280,
            height: 280,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,.12)",
          }}
        />
        <div className="wrap" style={{ position: "relative", textAlign: "center" }}>
          <h2
            className="reveal"
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: "-.02em",
              margin: "0 0 14px",
            }}
          >
            Tá valendo a pena? Os números dizem que sim.
          </h2>
          <p className="reveal" style={{ fontSize: 17, opacity: 0.9, maxWidth: 560, margin: "0 auto 48px" }}>
            Gestores que largaram a planilha e deixaram o 4YU CRM garimpar.
          </p>
          <div
            className="grid-4"
            style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 }}
          >
            {bigStats.map((s) => (
              <div key={s.l} className="reveal">
                <div
                  style={{
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 50,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {s.n}
                </div>
                <div style={{ fontSize: 14.5, opacity: 0.9, marginTop: 8, lineHeight: 1.4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DEPOIMENTOS ===== */}
      <section style={{ padding: "96px 0", background: "#fff" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 54px" }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-chat-circle-dots" style={{ fontSize: 15 }} /> Quem usa, recomenda
            </div>
            <h2 className="h2 reveal">Gestor nenhum quer voltar a garimpar na mão.</h2>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
            {testimonials.map((t) => (
              <div
                key={t.nome}
                className="reveal"
                style={{
                  background: "var(--soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: "28px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                <div style={{ display: "flex", gap: 3, color: "#E8A93B", fontSize: 16 }}>
                  <i className="ph ph-star-fill" />
                  <i className="ph ph-star-fill" />
                  <i className="ph ph-star-fill" />
                  <i className="ph ph-star-fill" />
                  <i className="ph ph-star-fill" />
                </div>
                <div style={{ fontSize: 15.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{t.q}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: "var(--grad)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {t.in}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.nome}</div>
                    <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{t.cargo}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PLANOS ===== */}
      <section id="planos" style={{ padding: "96px 0", background: "var(--soft)" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 56px" }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-tag" style={{ fontSize: 15 }} /> Planos
            </div>
            <h2 className="h2 reveal">Escolhe e começa hoje.</h2>
            <p className="lead reveal" style={{ marginTop: 18 }}>
              Sem fidelidade. Cancela quando quiser. O primeiro garimpo sai no mesmo dia.
            </p>
          </div>
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 22,
              alignItems: "stretch",
            }}
          >
            {plans.map((p) => (
              <div key={p.nome} className="reveal" style={p.cardStyle}>
                {p.popular && (
                  <div
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 18,
                      background: "#fff",
                      color: "var(--brand-700)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      padding: "6px 12px",
                      borderRadius: 999,
                    }}
                  >
                    Mais usado
                  </div>
                )}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: p.accent,
                    marginBottom: 10,
                  }}
                >
                  {p.nome}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 42,
                      fontWeight: 700,
                      color: p.priceCol,
                    }}
                  >
                    {p.preco}
                  </span>
                  <span style={{ fontSize: 15, color: p.mutedCol }}>/mês</span>
                </div>
                <div style={{ fontSize: 14, color: p.mutedCol, marginBottom: 22, lineHeight: 1.5 }}>
                  {p.sub}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
                  {p.feats.map((ft) => (
                    <div
                      key={ft}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        fontSize: 14,
                        color: p.featCol,
                      }}
                    >
                      <i
                        className="ph ph-check-circle"
                        style={{ fontSize: 18, color: p.accent, flex: "none" }}
                      />{" "}
                      {ft}
                    </div>
                  ))}
                </div>
                <Link href="/login" style={p.btnStyle}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" style={{ padding: "96px 0", background: "#fff" }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="eyebrow reveal" style={{ marginBottom: 18 }}>
              <i className="ph ph-question" style={{ fontSize: 15 }} /> Perguntas frequentes
            </div>
            <h2 className="h2 reveal">Ainda na dúvida? A gente responde.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {faqList.map((f, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={f.q}
                  className="reveal"
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "20px 22px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{f.q}</span>
                    <i
                      className={`ph ph-${open ? "minus" : "plus"}`}
                      style={{ fontSize: 20, color: "var(--brand)", flex: "none" }}
                    />
                  </button>
                  <div
                    style={{
                      maxHeight: open ? 240 : 0,
                      overflow: "hidden",
                      transition: "max-height .35s cubic-bezier(.22,1,.36,1)",
                    }}
                  >
                    <div
                      style={{
                        padding: "0 22px 20px",
                        fontSize: 14.5,
                        color: "var(--muted)",
                        lineHeight: 1.6,
                      }}
                    >
                      {f.a}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section style={{ padding: "30px 0 96px", background: "#fff" }}>
        <div className="wrap">
          <div
            className="reveal"
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 28,
              background: "var(--grad)",
              color: "#fff",
              padding: "64px 56px",
              textAlign: "center",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -50,
                top: -60,
                width: 280,
                height: 280,
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,.16)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -60,
                bottom: -70,
                width: 240,
                height: 240,
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,.13)",
              }}
            />
            <div style={{ position: "relative" }}>
              <h2
                style={{
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 40,
                  fontWeight: 700,
                  letterSpacing: "-.02em",
                  margin: "0 0 14px",
                }}
              >
                Seu próximo cliente já existe.
                <br />
                Deixa a gente achar pra você.
              </h2>
              <p style={{ fontSize: 17, opacity: 0.92, maxWidth: 520, margin: "0 auto 30px" }}>
                Comece hoje e veja, ainda essa semana, a fila encher de gente que precisa de você.
              </p>
              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  href="/login"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    background: "#fff",
                    color: "var(--brand-700)",
                    borderRadius: 999,
                    padding: "16px 30px",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Começar agora <i className="ph ph-arrow-right" style={{ fontSize: 18 }} />
                </Link>
                <a
                  href="https://wa.me/5511911001414"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    background: "rgba(255,255,255,.16)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,.4)",
                    borderRadius: 999,
                    padding: "16px 30px",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  <i className="ph ph-whatsapp-logo" style={{ fontSize: 19 }} /> Falar no WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{ background: "#140C28", color: "#CFC8E0", padding: "64px 0 30px" }}>
        <div className="wrap">
          <div
            className="foot-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
              gap: 40,
              paddingBottom: 44,
              borderBottom: "1px solid rgba(255,255,255,.1)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
                <Image
                  src="/4yu-icon.png"
                  alt="4YU CRM"
                  width={36}
                  height={36}
                  style={{ width: 36, height: 36, objectFit: "contain" }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 3,
                    fontFamily: "'Space Grotesk',sans-serif",
                    color: "#fff",
                  }}
                >
                  <span style={{ fontSize: 21, fontWeight: 700 }}>4YU</span>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", color: "#B98DF0" }}>
                    CRM
                  </span>
                </div>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "#9D96B0",
                  lineHeight: 1.6,
                  maxWidth: 280,
                  margin: "0 0 18px",
                }}
              >
                O garimpo de leads no automático pra quem vive de tráfego. Acha, organiza e te entrega pronto
                pra fechar.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {socials.map((s) => (
                  <a
                    key={s}
                    href="#"
                    className="social-link"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: "rgba(255,255,255,.07)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#CFC8E0",
                      fontSize: 18,
                    }}
                  >
                    <i className={`ph ph-${s}`} />
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                Produto
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {footProduct.map((l) => (
                  <a key={l.href} href={l.href} className="foot-link" style={{ fontSize: 14, color: "#9D96B0" }}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                Legal
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <Link href="/privacidade" className="foot-link" style={{ fontSize: 14, color: "#9D96B0" }}>
                  Política de Privacidade
                </Link>
                <Link href="/termos" className="foot-link" style={{ fontSize: 14, color: "#9D96B0" }}>
                  Termos de Uso
                </Link>
                <Link
                  href="/privacidade#lgpd"
                  className="foot-link"
                  style={{ fontSize: 14, color: "#9D96B0" }}
                >
                  LGPD
                </Link>
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                Contato
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <a
                  href="mailto:4yumkt@gmail.com"
                  className="foot-link"
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: "#9D96B0" }}
                >
                  <i className="ph ph-envelope-simple" style={{ fontSize: 17, color: "#B98DF0" }} />{" "}
                  4yumkt@gmail.com
                </a>
                <a
                  href="https://wa.me/5511911001414"
                  target="_blank"
                  rel="noreferrer"
                  className="foot-link"
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: "#9D96B0" }}
                >
                  <i className="ph ph-whatsapp-logo" style={{ fontSize: 17, color: "#B98DF0" }} /> (11)
                  91100-1414
                </a>
                <a
                  href="https://wa.me/5511911001414"
                  target="_blank"
                  rel="noreferrer"
                  className="foot-link"
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: "#9D96B0" }}
                >
                  <i className="ph ph-map-pin" style={{ fontSize: 17, color: "#B98DF0" }} /> Atendimento
                  online, Brasil
                </a>
              </div>
            </div>
          </div>
          <div
            style={{
              paddingTop: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "#7E7794" }}>
              © 2026 4YU CRM. Todos os direitos reservados.
            </span>
            <span style={{ fontSize: 13, color: "#7E7794" }}>
              Feito pra quem vende, não pra quem garimpa.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
