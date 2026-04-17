"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Bot,
  Database,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  Play,
  Settings,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { API } from "@/lib/api"
import WorkspaceSwitcher from "./WorkspaceSwitcher"

const sections = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/evolution", label: "Evolução", icon: TrendingUp },
      { href: "/runs/compare", label: "Comparar Runs", icon: GitCompare },
    ],
  },
  {
    label: "Configuração",
    items: [
      { href: "/agents", label: "Agentes", icon: Bot },
      { href: "/profiles", label: "Perfis de Avaliação", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Testes",
    items: [
      { href: "/test-cases", label: "Casos de Teste", icon: FlaskConical },
      { href: "/runs", label: "Execuções", icon: Play },
    ],
  },
  {
    label: "Dados de produção",
    items: [
      { href: "/datasets", label: "Datasets", icon: Database },
      { href: "/evaluations", label: "Avaliações de Dataset", icon: BarChart2 },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/version`)
      .then(r => r.json())
      .then(d => { if (d.version) setVersion(`v${d.version} · build ${d.build}`) })
      .catch(() => {})
  }, [])
  const activeHref = sections
    .flatMap(section => section.items)
    .filter(item => item.exact ? pathname === item.href : pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return activeHref === href
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-gray-200 bg-white text-gray-900">
      <Link href="/" className="border-b border-gray-200 px-5 py-5 transition-colors hover:bg-gray-50">
        <div className="flex items-center gap-3">
          <img
            src="/logo-santander.png"
            alt="Santander"
            className="h-8 w-auto shrink-0"
          />
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold text-gray-950">AgentEval</span>
            <p className="truncate text-xs leading-tight text-gray-500">Validação de agentes</p>
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <WorkspaceSwitcher />
        <div className="mt-5 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-2 text-xs font-bold uppercase text-gray-500">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.href, item.exact)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                        active
                          ? "bg-white text-red-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-2 h-6 w-0.5 rounded-full bg-red-600" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 text-red-600" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <Link
          href="/settings"
          className={cn(
            "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
            pathname.startsWith("/settings")
              ? "bg-white text-red-700"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          )}
        >
          {pathname.startsWith("/settings") && (
            <span className="absolute left-0 top-2 h-6 w-0.5 rounded-full bg-red-600" />
          )}
          <Settings className="h-4 w-4 shrink-0 text-red-600" />
          <span className="truncate">Configurações</span>
        </Link>
        <p className="px-3 text-xs text-gray-400">{version ?? "AgentEval"}</p>
      </div>
    </aside>
  )
}
