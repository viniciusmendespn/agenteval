"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bot, Plus } from "lucide-react"
import { getAgents, type Agent } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"
import { TableSkeleton } from "@/components/Skeleton"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flame-page-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agentes</h1>
          <p className="mt-1 text-sm text-gray-500">Endpoints e modelos disponíveis neste workspace.</p>
        </div>
        <Link
          href="/agents/new"
          className="flame-button"
        >
          <Plus className="h-4 w-4" />
          Novo agente
        </Link>
      </div>

      {loading ? (
        <TableSkeleton columns={6} rows={6} />
      ) : agents.length === 0 ? (
        <div className="flame-empty">
          <div className="flame-icon-shell mx-auto mb-3 h-10 w-10">
            <Bot className="h-5 w-5 text-red-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Nenhum agente cadastrado ainda.</p>
        </div>
      ) : (
        <div className="flame-panel overflow-hidden">
          <table className="flame-table">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">URL</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name || <span className="text-gray-400 italic">sem nome</span>}</td>
                  <td className="px-4 py-3">
                    <span className="flame-chip">
                      {(a.connection_type || "http").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.model}</td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{a.url}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(a.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/agents/${a.id}/edit`} className="flame-link-action">
                        Editar
                      </Link>
                      <DeleteButton id={a.id} path="/agents" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
