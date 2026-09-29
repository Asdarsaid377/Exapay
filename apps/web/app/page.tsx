import { redirect } from "next/navigation";

// Proxy mengarahkan "/" sesuai sesi & peran; ini hanya cadangan jika proxy dilewati
export default function HomePage() {
  redirect("/login");
}
