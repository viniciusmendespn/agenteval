"use client"

import { useEffect, useState } from "react"
import { Briefcase, ChevronDown, RefreshCw } from "lucide-react"
import {
  clearActiveWorkspaceId,
  getActiveWorkspaceId,
  getWorkspaces,
  setActiveWorkspaceId,
  type Workspace,
} from "@/lib/api"

export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function loadWorkspaces() {
    setLoading(true)
    setError(null)
    getWorkspaces()
      .then(items => {
        const visibleItems = items.filter(w => w.slug !== "default")
        setWorkspaces(visibleItems)
        const stored = getActiveWorkspaceId()
        const selected = stored && visibleItems.some(w => String(w.id) === stored) ? stored : ""
        if (!selected) clearActiveWorkspaceId()
        setActiveId(selected)
      })
      .catch(err => setError(err instanceof Error ? err.message : "Erro ao carregar workspaces"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadWorkspaces()
  }, [])

  function selectWorkspace(id: string) {
    setActiveWorkspaceId(id)
    setActiveId(id)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
        <div className="mt-3 h-10 rounded bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-red-700">Workspace indisponível</p>
            <p className="mt-1 line-clamp-2 text-xs text-red-600">
              Reinicie o backend para carregar a rota /workspaces.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadWorkspaces}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </button>
      </div>
    )
  }

  const active = workspaces.find(w => String(w.id) === activeId)

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-gray-500">Workspace</span>
        {active?.role && (
          <span className="flame-chip max-w-[96px] truncate">
            {active.role}
          </span>
        )}
      </div>
      <div className="relative min-w-0">
        <Briefcase className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" />
        <select
          value={activeId}
          onChange={e => selectWorkspace(e.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 text-sm font-bold text-gray-900 focus:outline-none"
        >
          {workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
      {active?.slug && (
        <p className="mt-2 truncate text-xs text-gray-500">Projeto: {active.slug}</p>
      )}
    </div>
  )
}
