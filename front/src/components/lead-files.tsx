"use client";
// Anexos do lead (ex: contrato). Sobe pro bucket privado, lista, baixa por URL
// assinada e remove. Mostra na ficha, abaixo das anotacoes.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, DownloadSimple, Trash, UploadSimple, File as FileIcon } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import type { LeadFile } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (casa com o teto do bucket)

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function LeadFiles({ leadId }: { leadId: string }) {
  const repo = getRepo();
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await repo.listFiles(leadId));
    } catch {
      setFiles([]); // sem anexos ou sem permissao: lista vazia, sem barulho
    } finally {
      setLoading(false);
    }
  }, [leadId, repo]);

  useEffect(() => {
    // fetch-on-mount: carrega a lista ao abrir/trocar de lead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast.warning("Arquivo muito grande. O limite e 25 MB.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setUploading(true);
      try {
        await repo.uploadFile(leadId, file);
        toast.success("Arquivo anexado.");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao anexar o arquivo");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [leadId, repo, load],
  );

  const openFile = useCallback(
    async (f: LeadFile) => {
      setBusyPath(f.path);
      try {
        const url = await repo.fileSignedUrl(f.path);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        toast.error("Erro ao abrir o arquivo");
      } finally {
        setBusyPath(null);
      }
    },
    [repo],
  );

  const removeFile = useCallback(
    async (f: LeadFile) => {
      setBusyPath(f.path);
      try {
        await repo.deleteFile(f.path);
        toast.success("Arquivo removido.");
        await load();
      } catch {
        toast.error("Erro ao remover o arquivo");
      } finally {
        setBusyPath(null);
      }
    },
    [repo, load],
  );

  return (
    <div className="border-t border-border p-6 sm:p-7">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-faint">
          <Paperclip size={15} /> Anexos
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline disabled:opacity-60"
        >
          <UploadSimple size={14} /> {uploading ? "Enviando..." : "Anexar arquivo"}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded-[12px] bg-[var(--inset)]" />
      ) : files.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-3.5 text-[13px] text-faint">
          Nenhum arquivo ainda. Anexe o contrato ou outro documento (ate 25 MB).
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5"
            >
              <FileIcon size={18} className="flex-none text-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-ink">{f.name}</div>
                <div className="text-[11.5px] text-faint">{fmtSize(f.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => openFile(f)}
                disabled={busyPath === f.path}
                title="Abrir / baixar"
                className="flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-brand disabled:opacity-50"
              >
                <DownloadSimple size={16} />
              </button>
              <button
                type="button"
                onClick={() => removeFile(f)}
                disabled={busyPath === f.path}
                title="Remover"
                className="flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
              >
                <Trash size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
