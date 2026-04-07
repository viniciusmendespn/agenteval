import Link from "next/link"
import { getTestCases } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"

export const dynamic = "force-dynamic"

export default async function TestCasesPage() {
  let cases = []
  try { cases = await getTestCases() } catch {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Casos de Teste</h1>
        <Link href="/test-cases/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
          + Novo caso
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
          Nenhum caso de teste criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((tc) => (
            <div key={tc.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{tc.title}</p>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{tc.input}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {tc.expected_output && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">resposta esperada</span>
                  )}
                  {tc.context && tc.context.length > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{tc.context.length} contexto(s)</span>
                  )}
                  {tc.tags && tc.tags.split(",").map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.trim()}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link href={`/test-cases/${tc.id}/edit`} className="text-xs text-blue-500 hover:underline">
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
