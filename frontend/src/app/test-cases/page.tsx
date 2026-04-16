"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { FlaskConical, Plus, Search } from "lucide-react"
import { getTestCases, type TestCase } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { ListSkeleton } from "@/components/Skeleton"

export default function TestCasesPage() {
  const [cases, setCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

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
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Casos de Teste</h1>
          <p className="mt-1 text-sm text-gray-500">Perguntas, expectativas e contextos deste workspace.</p>
        </div>
        <Link href="/test-cases/new" className="flame-button">
          <Plus className="h-4 w-4" />
          Novo caso
        </Link>
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
        <ListSkeleton rows={6} />
      ) : cases.length === 0 ? (
        <div className="flame-empty">
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <FlaskConical className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Nenhum caso de teste criado ainda.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flame-empty">
          <p className="text-sm text-gray-500">Nenhum caso de teste encontrado para <span className="font-semibold">"{search}"</span>.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tc) => (
            <div key={tc.id} className="flame-panel flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{tc.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{tc.input}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tc.turns && tc.turns.length > 0 ? (
                    <span className="flame-chip bg-purple-100 text-purple-700 border-purple-200">{tc.turns.length} turnos</span>
                  ) : tc.expected_output ? (
                    <span className="flame-chip">resposta esperada</span>
                  ) : null}
                  {tc.context && tc.context.length > 0 && (
                    <span className="flame-chip">{tc.context.length} contexto(s)</span>
                  )}
                  {tc.tags && tc.tags.split(",").map((tag) => {
                    const label = tag.trim()
                    return label ? (
                      <span key={label} className="flame-chip">{label}</span>
                    ) : null
                  })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Link href={`/test-cases/${tc.id}/edit`} className="flame-link-action">
                  Editar
                </Link>
                <DeleteButton id={tc.id} path="/test-cases" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
