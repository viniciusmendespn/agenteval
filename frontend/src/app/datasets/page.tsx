"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Database, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { getDatasets, type Dataset } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { ListSkeleton } from "@/components/Skeleton"

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDatasets()
      .then(setDatasets)
      .catch(() => setDatasets([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
          <p className="mt-1 text-sm text-gray-500">
            Conversas históricas importadas para avaliação offline, sem chamar nenhum agente.
          </p>
        </div>
        <Link href="/datasets/import" className="flame-button">
          <Upload className="h-4 w-4" />
          Importar dataset
        </Link>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : datasets.length === 0 ? (
        <div className="flame-empty">
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <Database className="h-5 w-5 text-red-600" />
          </div>
          <p className="mb-3 text-sm font-semibold text-gray-700">Nenhum dataset importado ainda.</p>
          <Link href="/datasets/import" className="flame-link-action">
            Importar primeiro dataset
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((ds, i) => (
            <motion.div
              key={ds.id}
              className="flame-panel p-4"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.15 }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/datasets/${ds.id}`} className="font-semibold text-gray-900 hover:text-red-700">
                    {ds.name}
                  </Link>
                  {ds.description && (
                    <p className="mt-0.5 text-xs text-gray-400">{ds.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {ds.record_count.toLocaleString()} registros ·{" "}
                    {new Date(ds.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link href={`/datasets/${ds.id}/evaluate`} className="flame-button h-8 min-h-8 px-3 text-xs">
                    Avaliar
                  </Link>
                  <Link href={`/datasets/${ds.id}`} className="flame-link-action">
                    Ver registros
                  </Link>
                  <DeleteButton id={ds.id} path="/datasets" onDeleted={() => setDatasets(prev => prev.filter(x => x.id !== ds.id))} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
