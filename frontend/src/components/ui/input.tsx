import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border-soft bg-surface-2 px-3 font-mono text-sm text-ink",
        "placeholder:text-ink-dim/60 focus:border-neon/60 focus:outline-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
