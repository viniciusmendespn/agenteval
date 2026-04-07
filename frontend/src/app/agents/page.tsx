import Link from "next/link"
import { getAgents } from "@/lib/api"
import DeleteButton from "@/components/DeleteButton"

export const dynamic = "force-dynamic"

export default async function AgentsPage() {
  let agents = []
  try { agents = await getAgents() } catch {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agentes</h1>
        <Link
          href="/agents/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          + Novo agente
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
          Nenhum agente cadastrado ainda.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
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
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      a.connection_type === "sse"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
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
                      <Link href={`/agents/${a.id}/edit`} className="text-xs text-blue-500 hover:underline">
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
