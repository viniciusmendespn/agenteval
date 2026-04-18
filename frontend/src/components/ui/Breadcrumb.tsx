import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" />}
          {item.href ? (
            <Link
              href={item.href}
              className="text-gray-400 transition-colors hover:text-red-600"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-gray-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
