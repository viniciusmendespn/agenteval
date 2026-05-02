"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { FlaskConical, Loader2, Plus, Search, Bot } from "lucide-react"
import { motion } from "framer-motion"
import { getTestCases, type TestCase } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { TableSkeleton } from "@/components/Skeleton"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

function TypeBadge({ tc }: { tc: TestCase }) {
  if (tc.turns && tc.turns.length > 0)
    return <span className="flame-chip bg-purple-100 text-purple-700 border-purple-200">{tc.turns.length} turnos</span>
  return <span className="flame-chip">Single-turn</span>
}

function TagChips({ tags }: { tags?: string }) {
  if (!tags) return null
  const list = tags.split(",").map(t => t.trim()).filter(Boolean)
  if (list.length === 0) return null
  const visible = list.slice(0, 3)
  const extra = list.length - visible.length
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(tag => <span key={tag} className="flame-chip">{tag}</span>)}
      {extra > 0 && <span className="flame-chip text-gray-400">+{extra}</span>}
    </div>
  )
}

export default function TestCasesPage() {
  const [cases, setCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())

  function markDeleting(id: number) { setDeletingIds(prev => new Set([...prev, id])) }
  function unmarkDeleting(id: number) { setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s }) }

  useEffect(() => {
    getTestCases()
      .then(setCases)
      .catch(() => setCases([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cases
    return cases.filter(tc =>
      tc.title?.toLowerCase().includes(q) ||
      tc.input?.toLowerCase().includes(q) ||
      tc.tags?.toLowerCase().includes(q)
    )
  }, [cases, search])

  return (
    <div>
      <Breadcrumb items={[{ label: "Casos de Teste" }]} />
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Casos de Teste</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Carregando…" : `${cases.length} caso${cases.length !== 1 ? "s" : ""} neste workspace`}
          </p>
        </div>
        <Link href="/test-cases/new" className="flame-button">
          <Plus className="h-4 w-4" />
          Novo caso
        </Link>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--flame-teal)]/20 bg-[var(--flame-teal)]/5 px-4 py-3">
        <Bot className="h-5 w-5 shrink-0 text-[var(--flame-teal)]" />
        <p className="flex-1 text-sm text-gray-600">
          Use o <strong>Assistente de QA</strong> para gerar casos de teste automaticamente com IA, focados nas regras de negócio do seu agente.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-floatingchat"))}
          className="shrink-0 rounded-lg border border-[var(--flame-teal)] px-3 py-1.5 text-xs font-semibold text-[var(--flame-teal)] hover:bg-[var(--flame-teal)] hover:text-white transition-colors"
        >
          Abrir assistente
        </button>
      </div>

      {!loading && cases.length > 0 && (
        <div className="mb-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, pergunta ou tag…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={5} rows={6} />
      ) : cases.length === 0 ? (
        <div className="flame-empty">
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <FlaskConical className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Nenhum caso de teste criado ainda.</p>
          <Link href="/test-cases/new" className="flame-link mt-3 inline-block text-sm">
            Criar primeiro caso
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flame-empty">
          <p className="text-sm text-gray-500">Nenhum caso encontrado para <span className="font-semibold">"{search}"</span>.</p>
        </div>
      ) : (
        <div className="flame-panel overflow-hidden">
          <table className="flame-table">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pergunta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((tc, i) => (
                <motion.tr
                  key={tc.id}
                  className={deletingIds.has(tc.id) ? "pointer-events-none bg-gray-50" : "hover:bg-gray-50"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: deletingIds.has(tc.id) ? 0.4 : 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                    {tc.title}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge tc={tc} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                    {tc.input}
                  </td>
                  <td className="px-4 py-3">
                    <TagChips tags={tc.tags} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {new Date(tc.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {deletingIds.has(tc.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
                      ) : (
                        <>
                          <Link href={`/test-cases/${tc.id}/edit`} className="flame-link-action">Editar</Link>
                          <DeleteButton id={tc.id} path="/test-cases"
                            onDeleteStart={() => markDeleting(tc.id)}
                            onDeleteUndo={() => unmarkDeleting(tc.id)}
                            onDeleted={() => { setCases(prev => prev.filter(c => c.id !== tc.id)); unmarkDeleting(tc.id) }}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
