import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Растянуть на всю ширину — основной режим на телефоне. */
  block?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent active:bg-accent-hover disabled:bg-border-strong disabled:text-text-faint",
  secondary:
    "bg-surface text-text border border-border active:bg-surface-2 disabled:text-text-faint",
  ghost: "text-text-muted active:bg-surface-2 disabled:text-text-faint",
  danger: "bg-transparent text-danger border border-border active:bg-surface-2",
};

const sizes: Record<Size, string> = {
  // min-h-11 = 44px — минимальная зона нажатия по рекомендациям Apple
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-13 px-5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium",
        "transition-[background-color,transform] duration-150 active:scale-[0.985]",
        "disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}
