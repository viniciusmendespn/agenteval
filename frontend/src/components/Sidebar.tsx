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
  const activeHref = sections
    .flatMap(section => section.items)
    .filter(item => item.exact ? pathname === item.href : pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return activeHref === href
  }

  return (
    <aside className="w-64 h-full bg-white text-gray-900 flex flex-col border-r border-gray-200 shadow-santander">
      {/* Branding */}
      <Link href="/" className="px-5 py-5 border-b border-gray-200 hover:bg-blue-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-santander.png"
            alt="Santander"
            className="h-8 w-auto shrink-0"
          />
          <div>
            <span className="text-sm font-bold tracking-tight text-gray-950">Santander AgentEval</span>
            <p className="text-xs text-gray-500 leading-tight">Plataforma de Avaliação</p>
          </div>
        </div>
      </Link>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-normal">
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
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-blue-600")} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="px-5 py-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">Santander Flame UI - v0.2.0</p>
      </div>
    </aside>
  )
}
