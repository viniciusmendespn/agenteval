import { cn } from "@/lib/cn"

interface SpinnerProps {
  size?: "xs" | "sm" | "md"
  className?: string
}

const sizes = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
}

export function Spinner({ size = "sm", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent",
        sizes[size],
        className
      )}
      role="status"
      aria-label="Carregando"
    />
  )
}
