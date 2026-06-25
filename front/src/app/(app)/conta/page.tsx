"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_MOCK_MSG,
  updateName,
  updateEmail,
  updatePassword,
  uploadAvatar,
  removeAvatar,
} from "@/lib/account";

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4">
        <h2 className="text-base font-bold">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function ErrLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
      {msg}
    </p>
  );
}

export default function ContaPage() {
  const { user, mode, refreshUser } = useAuth();
  const isMock = mode !== "supabase";

  const initials = (user?.name ?? user?.email ?? "?").slice(0, 2).toUpperCase();

  // Foto
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");

  // Nome
  const [name, setName] = useState(user?.name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameErr, setNameErr] = useState("");

  // Email
  const [email, setEmail] = useState("");
  const [emailPwd, setEmailPwd] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState("");

  // Senha
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [curPwd, setCurPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdErr, setPwdErr] = useState("");

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
      toast.success("Foto atualizada.");
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "Não consegui salvar a foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      await removeAvatar();
      await refreshUser();
      toast.success("Foto removida.");
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "Não consegui remover a foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameErr("");
    setNameBusy(true);
    try {
      await updateName(name);
      await refreshUser();
      toast.success("Nome salvo.");
    } catch (err) {
      setNameErr(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setNameBusy(false);
    }
  }

  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr("");
    setEmailBusy(true);
    try {
      await updateEmail(email, emailPwd);
      setEmail("");
      setEmailPwd("");
      toast.success("Enviamos um link de confirmação para o novo email.");
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Não consegui trocar o email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function onSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdErr("");
    if (newPwd !== confirmPwd) {
      setPwdErr("A confirmação não bate com a nova senha.");
      return;
    }
    setPwdBusy(true);
    try {
      await updatePassword(newPwd, curPwd);
      setNewPwd("");
      setConfirmPwd("");
      setCurPwd("");
      toast.success("Senha trocada.");
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : "Não consegui trocar a senha.");
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Minha conta</h1>
        <p className="text-[13px] text-muted-foreground">Seu nome, foto e dados de acesso.</p>
      </div>

      {isMock && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {ACCOUNT_MOCK_MSG} As alterações abaixo ficam desativadas no modo demonstração.
        </div>
      )}

      <div className="space-y-5">
        {/* Perfil: foto + nome */}
        <Card title="Perfil">
          <div className="mb-5 flex items-center gap-4">
            <div className="relative">
              {user?.avatar_url ? (
                <div
                  role="img"
                  aria-label="Foto de perfil"
                  className="size-16 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url("${user.avatar_url}")` }}
                />
              ) : (
                <div
                  className="flex size-16 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: "var(--grad)" }}
                >
                  {initials}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickPhoto}
                  disabled={isMock || photoBusy}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isMock || photoBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera size={16} weight="bold" />
                  {photoBusy ? "Enviando..." : "Trocar foto"}
                </Button>
                {user?.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isMock || photoBusy}
                    onClick={onRemovePhoto}
                  >
                    <Trash size={16} />
                    Remover
                  </Button>
                )}
              </div>
              <span className="text-[12px] text-muted-foreground">PNG, JPG ou WEBP, até 2 MB.</span>
            </div>
          </div>
          <ErrLine msg={photoErr} />

          <form onSubmit={onSaveName} className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome de exibição</Label>
              <Input
                id="name"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                placeholder="Como você quer ser chamado"
                disabled={isMock || nameBusy}
                maxLength={80}
              />
            </div>
            <ErrLine msg={nameErr} />
            <Button type="submit" size="sm" disabled={isMock || nameBusy}>
              {nameBusy ? "Salvando..." : "Salvar nome"}
            </Button>
          </form>
        </Card>

        {/* Acesso: email */}
        <Card title="Email de acesso" sub="Trocar o email exige sua senha atual. Enviamos um link de confirmação para o novo endereço.">
          <form onSubmit={onSaveEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Novo email</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder={user?.email ?? "voce@empresa.com"}
                disabled={isMock || emailBusy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-cur-pwd">Senha atual</Label>
              <Input
                id="email-cur-pwd"
                type="password"
                autoComplete="current-password"
                value={emailPwd}
                onChange={(ev) => setEmailPwd(ev.target.value)}
                disabled={isMock || emailBusy}
              />
            </div>
            <ErrLine msg={emailErr} />
            <Button type="submit" size="sm" disabled={isMock || emailBusy || !email || !emailPwd}>
              {emailBusy ? "Enviando..." : "Trocar email"}
            </Button>
          </form>
        </Card>

        {/* Acesso: senha */}
        <Card title="Senha" sub="Mínimo de 8 caracteres. Confirme com a senha atual.">
          <form onSubmit={onSavePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Nova senha</Label>
              <Input
                id="new-pwd"
                type="password"
                autoComplete="new-password"
                value={newPwd}
                onChange={(ev) => setNewPwd(ev.target.value)}
                disabled={isMock || pwdBusy}
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">Confirmar nova senha</Label>
              <Input
                id="confirm-pwd"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(ev) => setConfirmPwd(ev.target.value)}
                disabled={isMock || pwdBusy}
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur-pwd">Senha atual</Label>
              <Input
                id="cur-pwd"
                type="password"
                autoComplete="current-password"
                value={curPwd}
                onChange={(ev) => setCurPwd(ev.target.value)}
                disabled={isMock || pwdBusy}
              />
            </div>
            <ErrLine msg={pwdErr} />
            <Button
              type="submit"
              size="sm"
              disabled={isMock || pwdBusy || !newPwd || !confirmPwd || !curPwd}
            >
              {pwdBusy ? "Trocando..." : "Trocar senha"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
