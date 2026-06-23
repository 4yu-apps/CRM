// Layout das paginas legais (publicas, fora do app logado), fiel ao design
// Claude (Privacidade.dc.html / Termos.dc.html): header com gradiente roxo,
// card branco com o documento e rodape com cross-links. Server component.
import Image from "next/image";
import Link from "next/link";

// CSS do design para o corpo do documento (.doc h2/h3/p/ul/li/a).
const LEGAL_CSS = `
.legal-root{
  background:#F7F5FC;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
  color:#160E29;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.legal-root *{box-sizing:border-box}
.legal-root .ph{line-height:1}
.legal-doc h2{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.01em;color:#160E29;margin:38px 0 12px;scroll-margin-top:90px}
.legal-doc h3{font-size:16px;font-weight:700;color:#160E29;margin:22px 0 8px}
.legal-doc p{font-size:15px;line-height:1.7;color:#3B3354;margin:0 0 14px}
.legal-doc ul{margin:0 0 16px;padding-left:22px}
.legal-doc li{font-size:15px;line-height:1.7;color:#3B3354;margin-bottom:7px}
.legal-doc a{color:#6D28D9;font-weight:600}
`;

export function LegalPage({
  title,
  updatedAt,
  crossLabel,
  crossHref,
  children,
}: {
  title: string;
  updatedAt: string;
  crossLabel: string;
  crossHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legal-root">
      {/* fontes (Plus Jakarta Sans + Space Grotesk) ja vem do root layout via
          next/font, expostas pelo nome de familia que o CSS abaixo referencia. */}
      {/* icones Phosphor WEB (server component: script async simples) */}
      <script src="https://unpkg.com/@phosphor-icons/web@2.1.1" async />
      <style dangerouslySetInnerHTML={{ __html: LEGAL_CSS }} />

      <header
        style={{
          background: "linear-gradient(135deg,#9D5BE8 0%,#6D28D9 60%,#531CA0 100%)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -50,
            top: -70,
            width: 280,
            height: 280,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,.16)",
          }}
        />
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "26px 28px 56px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 46,
            }}
          >
            <Link
              href="/"
              style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "#fff" }}
            >
              <Image
                src="/4yu-icon.png"
                alt="4YU CRM"
                width={36}
                height={36}
                style={{ width: 36, height: 36, objectFit: "contain", filter: "brightness(0) invert(1)" }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 3,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                <span style={{ fontSize: 21, fontWeight: 700 }}>4YU</span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em" }}>MKT</span>
              </div>
            </Link>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.34)",
                color: "#fff",
                borderRadius: 999,
                padding: "9px 16px",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <i className="ph ph-arrow-left" /> Voltar pro site
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                opacity: 0.85,
                marginBottom: 10,
              }}
            >
              Documento legal
            </div>
            <h1
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: "-.02em",
                margin: "0 0 10px",
              }}
            >
              {title}
            </h1>
            <p style={{ fontSize: 15, opacity: 0.9, margin: 0 }}>Última atualização: {updatedAt}</p>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "-28px auto 0", padding: "0 28px 80px" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #ECE7F5",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(50,24,100,.08)",
            padding: "40px 44px",
          }}
        >
          <div className="legal-doc">{children}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 28 }}>
          <Link
            href={crossHref}
            style={{ fontSize: 14, fontWeight: 600, color: "#6D28D9", textDecoration: "none" }}
          >
            {crossLabel}
          </Link>
          <span style={{ color: "#C9C2D8" }}>·</span>
          <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: "#6D28D9", textDecoration: "none" }}>
            Voltar pro site
          </Link>
        </div>
      </div>
    </div>
  );
}
