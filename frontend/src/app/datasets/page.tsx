import Link from "next/link"
import { getDatasets } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"

export const dynamic = "force-dynamic"

export default async function DatasetsPage() {
  let datasets = []
  try { datasets = await getDatasets() } catch {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Conversas históricas importadas para avaliação offline — sem chamar nenhum agente.
          </p>
        </div>
        <Link href="/datasets/import"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
          ↑ Importar dataset
        </Link>
      </div>

      {datasets.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-3">Nenhum dataset importado ainda.</p>
          <Link href="/datasets/import" className="text-blue-600 text-sm hover:underline">
            Importar primeiro dataset →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((ds) => (
            <div key={ds.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/datasets/${ds.id}`}
                    className="font-medium text-gray-900 hover:text-blue-600">
                    {ds.name}
                  </Link>
                  {ds.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{ds.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {ds.record_count.toLocaleString()} registros ·{" "}
                    {new Date(ds.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link href={`/datasets/${ds.id}/evaluate`}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                    Avaliar
                  </Link>
                  <Link href={`/datasets/${ds.id}`}
                    className="text-xs text-blue-500 hover:underline">
                    Ver registros
                  </Link>
                  <DeleteButton id={ds.id} path="/datasets" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
