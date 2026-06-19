"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab = "login" | "cadastro";

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, mode } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    reset();
    try {
      if (tab === "login") {
        await signIn(email, password);
        router.replace("/");
      } else {
        await signUp(email, password);
        setInfo("Conta criada. Verifique seu e-mail para confirmar antes de entrar.");
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Algo deu errado";
      // Mensagem amigavel para erros comuns do Supabase Auth
      if (msg.toLowerCase().includes("invalid login credentials")) {
        setError("E-mail ou senha incorretos. Tente de novo.");
      } else if (msg.toLowerCase().includes("user already registered")) {
        setError("Ja existe uma conta com esse e-mail. Entre com sua senha.");
      } else if (msg.toLowerCase().includes("password should be at least")) {
        setError("A senha precisa ter no minimo 6 caracteres.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    reset();
    try {
      await signInWithGoogle();
      // Se chegar aqui sem redirect, o provider nao esta ativo
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.toLowerCase().includes("provider") ||
        msg.toLowerCase().includes("not enabled") ||
        msg.toLowerCase().includes("oauth")
      ) {
        setError("Login com Google ainda nao esta ativo. Use e-mail e senha por enquanto.");
      } else if (msg) {
        setError(msg);
      } else {
        setError("Login com Google ainda nao esta ativo. Use e-mail e senha por enquanto.");
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  // Modo mock: entrada direta sem formulario
  if (mode === "mock") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <LogoBlock />
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h1 className="mb-1 text-xl font-bold tracking-tight">Modo demonstracao</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Dados de exemplo, sem conexao com banco. Explore a vontade.
            </p>
            <Button
              className="w-full"
              onClick={async () => {
                await signIn("demo", "demo");
                router.replace("/");
              }}
            >
              Entrar como demo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <LogoBlock />

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Tabs login / cadastro */}
          <div className="flex border-b border-border">
            {(["login", "cadastro"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); reset(); }}
                className={cn(
                  "flex-1 py-3.5 text-sm font-semibold transition-colors capitalize",
                  tab === t
                    ? "border-b-2 border-brand text-brand bg-accent/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <div className="p-8 space-y-5">
            {/* Botao Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleBusy}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              <GoogleIcon />
              {googleBusy ? "Aguarde..." : "Continuar com Google"}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* Formulario email + senha */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  placeholder={tab === "cadastro" ? "Minimo 6 caracteres" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={tab === "cadastro" ? 6 : undefined}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {info}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy
                  ? tab === "login" ? "Entrando..." : "Criando conta..."
                  : tab === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Seus dados sao isolados por conta. Ninguem ve o que e seu.
        </p>
      </div>
    </div>
  );
}

function LogoBlock() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="inline-flex items-center rounded-xl bg-zinc-900 px-5 py-3">
        <Image src="/logo.png" alt="4YUmkt" width={1080} height={419} priority className="h-8 w-auto" />
      </span>
      <p className="text-center text-sm text-muted-foreground">
        CRM de prospeccao com IA
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
