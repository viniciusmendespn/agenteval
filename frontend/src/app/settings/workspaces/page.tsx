"use client"

import { useEffect, useState } from "react"
import { Briefcase, Plus, RefreshCw, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import {
  createWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  setActiveWorkspaceId,
  type Workspace,
} from "@/lib/api"
import { WorkspaceListSkeleton } from "@/components/Skeleton"
import { LoadingButton } from "@/components/ui/LoadingButton"

export default function WorkspaceSettingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState("")
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    getWorkspaces()
      .then(items => {
        setWorkspaces(items.filter(workspace => workspace.slug !== "default"))
        setActiveId(getActiveWorkspaceId() ?? "")
      })
      .catch(err => setError(err instanceof Error ? err.message : "Erro ao carregar workspaces"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const workspace = await createWorkspace({
        name: name.trim(),
        slug: slug.trim() || undefined,
      })
      setActiveWorkspaceId(workspace.id)
      setName("")
      setSlug("")
      setOpen(false)
      toast.success("Workspace criado")
      await getWorkspaces().then(items => setWorkspaces(items.filter(item => item.slug !== "default")))
      setActiveId(String(workspace.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar workspace")
      toast.error("Erro ao criar workspace")
    } finally {
      setSaving(false)
    }
  }

  function activate(workspace: Workspace) {
    setActiveWorkspaceId(workspace.id)
    setActiveId(String(workspace.id))
    window.sessionStorage.setItem("agenteval.workspaceConfirmed", String(workspace.id))
    window.location.reload()
  }

  return (
    <div className="max-w-5xl space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="flame-panel">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex w-full items-start justify-between gap-4 p-5 text-left">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Novo workspace</h2>
            <p className="text-sm text-gray-500 mt-1">
              Crie um projeto isolado para manter dados e execuções separados.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flame-icon-shell h-10 w-10">
              <Plus className="h-5 w-5 text-red-600" />
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>

        {open && <form onSubmit={submit} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
              placeholder="Ex: Atendimento Digital"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Slug opcional</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
              placeholder="atendimento-digital"
            />
          </div>
          <LoadingButton
            type="submit"
            isLoading={saving}
            loadingText="Criando workspace…"
            disabled={!name.trim()}
          >
            Criar workspace
          </LoadingButton>
        </form>}
      </section>

      <section className="flame-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Workspaces</h2>
            <p className="text-sm text-gray-500 mt-0.5">Selecione qual projeto fica ativo no navegador.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flame-button-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {loading ? (
          <WorkspaceListSkeleton />
        ) : (
          <div className="divide-y divide-gray-100">
            {workspaces.map(workspace => {
              const active = String(workspace.id) === activeId
              return (
                <div key={workspace.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flame-icon-shell h-10 w-10 shrink-0">
                      <Briefcase className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{workspace.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {workspace.slug} · {workspace.role}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => activate(workspace)}
                    disabled={active}
                    className={active
                      ? "flame-button opacity-60 cursor-default"
                      : "flame-button-secondary"}
                  >
                    {active ? "Ativo" : "Ativar"}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
