type Props = {
  title: string;
  description?: string;
};

// Judul di dalam card auth. Dipakai AuthShell, atau langsung oleh form yang judulnya berubah per langkah.
export function AuthHeading({ title, description }: Props) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-2xl leading-tight font-extrabold tracking-[-0.025em] text-text-primary">{title}</h1>
      {description ? <p className="text-body text-text-secondary text-pretty">{description}</p> : null}
    </header>
  );
}
