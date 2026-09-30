import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

// Checkbox native berwarna aksen (ui-tokens accent). Dibungkus <label> oleh pemanggil agar area sentuh ≥ 44px.
export function Checkbox(props: Props) {
  return <input type="checkbox" className="size-4.5 shrink-0 cursor-pointer accent-accent disabled:cursor-default" {...props} />;
}
