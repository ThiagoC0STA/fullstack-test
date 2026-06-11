import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-accent text-[#0c0c0c] hover:bg-accent-dim",
        danger: "bg-danger text-white hover:brightness-110",
        outline: "border border-edge bg-transparent text-ink hover:border-edge-strong",
        ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
      },
      // desktop stays dense; mobile honors the 44px touch-target minimum
      size: {
        default: "h-9 px-4 text-[13px] max-sm:h-11",
        sm: "h-7 px-2.5 text-xs max-sm:h-11",
        lg: "h-10 px-5 text-sm max-sm:h-12",
        icon: "size-8 max-sm:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
