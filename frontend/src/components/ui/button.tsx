import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-neon cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-neon text-black hover:bg-neon-dim active:scale-[0.98]",
        danger: "bg-danger text-white hover:brightness-110 active:scale-[0.98]",
        outline:
          "border border-border-soft bg-transparent text-ink hover:border-neon/60 hover:text-neon",
        ghost: "bg-transparent text-ink-dim hover:bg-card hover:text-ink",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-14 px-6 text-lg",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
