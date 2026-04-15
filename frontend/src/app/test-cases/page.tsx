"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FlaskConical, Plus } from "lucide-react"
import { getTestCases, type TestCase } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { ListSkeleton } from "@/components/Skeleton"

export default function TestCasesPage() {
  const [cases, setCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTestCases()
      .then(setCases)
      .catch(() => setCases([]))
      .finally(() => setLoading(false))
  }, [])

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

      {loading ? (
        <ListSkeleton rows={6} />
      ) : cases.length === 0 ? (
        <div className="flame-empty">
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <FlaskConical className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Nenhum caso de teste criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((tc) => (
            <div key={tc.id} className="flame-panel flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{tc.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{tc.input}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tc.expected_output && (
                    <span className="flame-chip">resposta esperada</span>
                  )}
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
