// Layout simples e legivel pras paginas legais (publicas, fora do app logado).
import Image from "next/image";
import Link from "next/link";

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-4">
          <Link href="/login" className="inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2">
            <Image src="/logo.png" alt="4YUmkt" width={1080} height={419} priority className="h-6 w-auto" />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-brand hover:underline">
            Voltar ao login
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-6 py-10">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="legal-prose mt-8 flex flex-col gap-5 text-[15px] leading-relaxed text-ink-2">
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 text-[13px] text-muted-foreground">
          <span>4YUmkt CRM</span>
          <Link href="/privacidade" className="hover:text-brand">Política de Privacidade</Link>
          <Link href="/termos" className="hover:text-brand">Termos de Uso</Link>
          <a href="mailto:4yumkt@gmail.com" className="hover:text-brand">4yumkt@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 text-lg font-bold text-ink">{children}</h2>;
}
