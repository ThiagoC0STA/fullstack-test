import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-ink-2",
        success: "bg-accent/10 text-accent",
        danger: "bg-danger/10 text-danger",
        gold: "bg-gold/10 text-gold",
        pending: "bg-surface-2 text-ink-3 animate-pulse",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
