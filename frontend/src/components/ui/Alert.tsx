import { cn } from "@/lib/cn"
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react"

type AlertVariant = "info" | "success" | "warning" | "error"

const config: Record<AlertVariant, { icon: typeof Info; classes: string }> = {
  info: {
    icon: Info,
    classes: "border-teal-200 bg-teal-50 text-teal-800",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-green-200 bg-green-50 text-green-800",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-yellow-200 bg-yellow-50 text-yellow-800",
  },
  error: {
    icon: AlertCircle,
    classes: "border-red-200 bg-red-50 text-red-700",
  },
}

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  className?: string
  onDismiss?: () => void
}

export function Alert({ variant = "info", title, children, className, onDismiss }: AlertProps) {
  const { icon: Icon, classes } = config[variant]
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", classes, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
