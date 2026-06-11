import { cn } from "@/lib/utils";

/** Shimmer skeleton: a highlight sweeps across the placeholder. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,#1c1c1c_25%,#262626_37%,#1c1c1c_63%)] bg-[length:400%_100%]",
        className,
      )}
      {...props}
    />
  );
}
