type Props = {
  title: string;
  description?: string;
};

// Judul di dalam card auth. Dipakai AuthShell, atau langsung oleh form yang judulnya berubah per langkah.
export function AuthHeading({ title, description }: Props) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-text-primary">{title}</h1>
      {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
    </header>
  );
}
