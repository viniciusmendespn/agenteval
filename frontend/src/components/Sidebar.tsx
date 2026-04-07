"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Bot,
  FlaskConical,
  Database,
  SlidersHorizontal,
  Play,
  GitCompare,
  BarChart2,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/cn"

const sections = [
  {
    label: "Visão Geral",
    items: [
      { href: "/",        label: "Dashboard",           icon: LayoutDashboard, exact: true },
      { href: "/evolution", label: "Evolução", icon: TrendingUp },
      { href: "/runs/compare", label: "Comparar Runs", icon: GitCompare },
    ],
  },
  {
    label: "Configuração",
    items: [
      { href: "/agents",   label: "Agentes",             icon: Bot },
      { href: "/profiles", label: "Perfis de Avaliação", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Testes",
    items: [
      { href: "/test-cases", label: "Casos de Teste",  icon: FlaskConical },
      { href: "/runs",       label: "Execuções",        icon: Play },
    ],
  },
  {
    label: "Dados de Produção",
    items: [
      { href: "/datasets",     label: "Datasets",               icon: Database },
      { href: "/evaluations",  label: "Avaliações de Dataset",  icon: BarChart2 },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 h-full bg-gray-950 text-gray-100 flex flex-col">
      {/* Branding */}
      <Link href="/" className="px-5 py-5 border-b border-gray-800 hover:bg-gray-900 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight">AgentEval</span>
            <p className="text-xs text-gray-500 leading-tight">Plataforma de Avaliação</p>
          </div>
        </div>
      </Link>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="px-5 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">v0.2.0</p>
      </div>
    </aside>
  )
}
