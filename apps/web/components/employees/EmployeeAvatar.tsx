import { initialsOf } from "@/lib/employeeLabels";

type Props = {
  fullName: string;
  // sm: 36px (baris tabel) · md: 40px (card mobile) · lg: 56px mobile / 68px desktop (header detail)
  size?: "sm" | "md" | "lg";
  inactive?: boolean;
};

const SIZE_CLASSES = {
  sm: "size-9 text-[13px] font-bold",
  md: "size-10 text-[13px] font-bold",
  lg: "size-14 text-lg font-extrabold lg:size-17 lg:text-[22px]",
};

// Lingkaran inisial karyawan (warna pasir). Nonaktif: netral + teks redup. Beda dengan UserAvatar (gelap, akun login).
export function EmployeeAvatar({ fullName, size = "sm", inactive = false }: Props) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-display ${SIZE_CLASSES[size]} ${
        inactive ? "bg-text-primary/6 text-text-tertiary" : "bg-shape-sand text-text-primary"
      }`}
    >
      {initialsOf(fullName)}
    </span>
  );
}
