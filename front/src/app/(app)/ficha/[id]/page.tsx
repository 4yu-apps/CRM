import { Placeholder } from "@/components/placeholder";

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Placeholder
      title="Ficha do lead"
      phase="C3"
      note={`Lead ${id}. Dados com fonte, leitura dos sinais, abordagem, histórico, LGPD, ações e valor entram na C3.`}
    />
  );
}
