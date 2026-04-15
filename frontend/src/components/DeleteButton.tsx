"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { API, workspaceHeaders } from "@/lib/api"

interface Props {
  id: number
  path: string  // ex: "/agents"
}

export default function DeleteButton({ id, path }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`${API}${path}/${id}`, { method: "DELETE", headers: workspaceHeaders(false) })
      router.refresh()
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded disabled:opacity-50"
        >
          {loading ? "..." : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-gray-600 px-1"
        >
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
    >
      Excluir
    </button>
  )
}
