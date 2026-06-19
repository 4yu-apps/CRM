export default function Inicio() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div
        className="fu relative overflow-hidden rounded-[22px] p-10 text-white shadow-[var(--shadow-md)]"
        style={{ background: "var(--grad)" }}
      >
        <div className="text-[13px] font-semibold opacity-85">Início</div>
        <h1 className="mt-2.5 font-heading text-4xl font-bold leading-tight tracking-tight">
          Shell pronto.
          <br />
          Falta encher as telas.
        </h1>
        <p className="mt-2 max-w-lg text-base opacity-90">
          O design system e a navegação já estão no ar. O conteúdo do Início (hero, feed e meta) entra
          na fase C1.
        </p>
      </div>
    </div>
  );
}
