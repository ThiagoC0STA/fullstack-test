import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-edge bg-bg px-3 font-mono text-[13px] text-ink",
        "placeholder:text-ink-3 transition-colors duration-150 ease-out",
        "focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
