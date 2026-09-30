type Props = {
  fullName: string;
  // md: 40px (header) · lg: 44px (portal)
  size?: "md" | "lg";
};

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : (parts[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase() || "?";
}

// Lingkaran inisial gelap (ui-rules "Navigasi" — Avatar)
export function UserAvatar({ fullName, size = "md" }: Props) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-inverse font-display font-bold text-on-inverse ${size === "lg" ? "size-11 text-sm" : "size-10 text-[13px] lg:text-sm"}`}
    >
      {initialsOf(fullName)}
    </span>
  );
}
