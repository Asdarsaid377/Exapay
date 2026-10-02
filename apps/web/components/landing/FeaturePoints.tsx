type Props = {
  points: readonly string[];
  large?: boolean;
};

// Daftar poin fitur — teks dengan garis pemisah, tanpa ikon (ui-rules "Gaya yang Ditolak User")
export function FeaturePoints({ points, large = false }: Props) {
  return (
    <ul className="flex flex-col">
      {points.map((point) => (
        <li
          key={point}
          className={`border-t border-text-primary/10 py-2.5 text-[14.5px] leading-[1.45] lg:py-3 ${large ? "lg:py-3.25 lg:text-base" : "lg:text-[15.5px]"}`}
        >
          {point}
        </li>
      ))}
    </ul>
  );
}
