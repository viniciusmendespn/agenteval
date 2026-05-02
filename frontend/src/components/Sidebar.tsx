"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  BarChart2,
  Bot,
  Database,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  MessageSquare,
  Play,
  PlayCircle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { API, CURRENT_USER_EMAIL, CURRENT_USER_NAME } from "@/lib/api"
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
      { href: "/guardrails", label: "Guardrails", icon: ShieldCheck },
      { href: "/playground", label: "Playground", icon: MessageSquare },
    ],
  },
  {
    label: "Testes",
    items: [
      { href: "/test-cases", label: "Casos de Teste", icon: FlaskConical },
      { href: "/runs", label: "Execuções", icon: Play },
      { href: "/simulations", label: "Simulações", icon: PlayCircle },
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

  const settingsActive = pathname.startsWith("/settings")

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
              <div className="space-y-0.5">
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
                          ? "bg-red-50/60 text-red-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute left-0 top-2 h-6 w-0.5 rounded-full bg-red-600"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-red-600" : "text-gray-400")} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
          {CURRENT_USER_NAME.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{CURRENT_USER_NAME}</p>
          {version
            ? <p className="truncate text-[10px] text-gray-400">{version}</p>
            : <p className="truncate text-xs text-gray-400">{CURRENT_USER_EMAIL}</p>
          }
        </div>
        <Link
          href="/settings"
          title="Configurações"
          className={cn(
            "relative shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            settingsActive
              ? "bg-red-50 text-red-600"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
        >
          {settingsActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute left-0 top-0.5 h-6 w-0.5 rounded-full bg-red-600"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  )
}
