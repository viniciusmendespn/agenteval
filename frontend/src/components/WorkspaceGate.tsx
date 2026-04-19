"use client"

import { useEffect, useState } from "react"
import { Briefcase, RefreshCw, Plus } from "lucide-react"
import {
  clearActiveWorkspaceId,
  createWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  setActiveWorkspaceId,
  type Workspace,
} from "@/lib/api"
import { Skeleton } from "@/components/Skeleton"

type Props = {
  children: React.ReactNode
}

const WORKSPACE_SESSION_KEY = "agenteval.workspaceConfirmed"

export default function WorkspaceGate({ children }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // create form state
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    getWorkspaces()
      .then(items => {
        const visible = items.filter(workspace => workspace.slug !== "default")
        setWorkspaces(visible)
        const activeId = getActiveWorkspaceId()
        const confirmedId = window.sessionStorage.getItem(WORKSPACE_SESSION_KEY)
        if (
          activeId &&
          confirmedId === activeId &&
          visible.some(workspace => String(workspace.id) === activeId)
        ) {
          setReady(true)
          return
        }
        if (!activeId || !visible.some(workspace => String(workspace.id) === activeId)) {
          clearActiveWorkspaceId()
        }
        setReady(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "Erro ao carregar workspaces")
        setReady(false)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function selectWorkspace(id: number) {
    setActiveWorkspaceId(id)
    window.sessionStorage.setItem(WORKSPACE_SESSION_KEY, String(id))
    setReady(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const ws = await createWorkspace({ name })
      selectWorkspace(ws.id)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro ao criar workspace")
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 p-6">
        <div className="flame-panel w-full max-w-md p-6">
          <Skeleton className="mx-auto h-10 w-10" />
          <Skeleton className="mx-auto mt-5 h-5 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-64" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (ready) return <>{children}</>

  const isFirstTime = workspaces.length === 0 && !error

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 p-6">
      <div className="flame-panel w-full max-w-lg p-6">
        <div className="flame-icon-shell mx-auto h-12 w-12">
          <Briefcase className="h-6 w-6 text-red-600" />
        </div>

        {isFirstTime ? (
          <>
            <div className="mt-5 text-center">
              <h1 className="text-xl font-bold text-gray-900">Bem-vindo ao AgentEval</h1>
              <p className="mt-2 text-sm text-gray-500">
                Crie seu primeiro workspace para começar a avaliar agentes.
              </p>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome do workspace"
                required
                autoFocus
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {createError && (
                <p className="text-xs text-red-600">{createError}</p>
              )}
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flame-button w-full"
              >
                <Plus className="h-4 w-4" />
                {creating ? "Criando…" : "Criar workspace"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mt-5 text-center">
              <h1 className="text-xl font-bold text-gray-900">Selecione um workspace</h1>
              <p className="mt-2 text-sm text-gray-500">
                Escolha o projeto que deseja acessar para carregar agentes, casos de teste,
                execuções e datasets.
              </p>
            </div>

            {error && (
              <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 space-y-3">
              {workspaces.map(workspace => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => selectWorkspace(workspace.id)}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-4 py-3 text-left transition-colors hover:border-red-600 hover:text-red-700"
                >
                  <span>
                    <span className="block text-sm font-bold text-gray-900">{workspace.name}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{workspace.slug}</span>
                  </span>
                  <span className="flame-chip">{workspace.role}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={load}
              className="flame-button-secondary mt-5 w-full"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar workspaces
            </button>
          </>
        )}
      </div>
    </div>
  )
}
