"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { TextField } from "@/components/common/TextField";

type Props = Omit<ComponentProps<typeof TextField>, "type" | "trailing">;

export function PasswordField(props: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="flex size-8 items-center justify-center rounded-inner text-text-secondary transition-colors hover:bg-fill-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
        >
          {visible ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        </button>
      }
    />
  );
}
