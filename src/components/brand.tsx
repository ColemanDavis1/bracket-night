import { cn } from "@/lib/utils";
import { BRANDING } from "@/lib/branding";

/** The Bracket Night wordmark: a broadcast-red bracket glyph + name. */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", text, className)}>
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-md bg-primary font-mono text-primary-foreground shadow"
      >
        ⟨⟩
      </span>
      <span>
        {BRANDING.name.split(" ")[0]}
        <span className="text-primary"> {BRANDING.name.split(" ").slice(1).join(" ")}</span>
      </span>
    </span>
  );
}
