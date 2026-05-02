"use client"

import { useRouter } from "next/navigation"
import { API, workspaceHeaders } from "@/lib/api"
import { toastError } from "@/lib/toast"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Trash2 } from "lucide-react"

const LABELS: Record<string, string> = {
  "/agents": "Agente",
  "/test-cases": "Caso de teste",
  "/datasets": "Dataset",
  "/profiles": "Perfil de avaliação",
  "/runs": "Execução",
  "/workspaces": "Workspace",
  "/simulations": "Simulação",
}

interface Props {
  id: number
  path: string
  onDeleted?: () => void
  onDeleteStart?: () => void
  onDeleteUndo?: () => void
}

export default function DeleteButton({ id, path, onDeleted, onDeleteStart, onDeleteUndo }: Props) {
  const router = useRouter()
  const label = LABELS[path] || "Item"

  async function handleDelete() {
    let undone = false
    onDeleteStart?.()

    toast.success(`${label} excluído`, {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true
          onDeleteUndo?.()
        },
      },
    })

    await new Promise(r => setTimeout(r, 5000))

    if (undone) return

    try {
      const res = await fetch(`${API}${path}/${id}`, { method: "DELETE", headers: workspaceHeaders(false) })
      if (!res.ok) throw new Error(await res.text())
      if (onDeleted) onDeleted()
      else router.refresh()
    } catch (err) {
      onDeleteUndo?.()
      toastError(err instanceof Error ? err.message : "Erro ao excluir. Tente novamente.")
    }
  }

  return (
    <ConfirmDialog
      title={`Excluir ${label.toLowerCase()}?`}
      description="Esta ação não pode ser desfeita. O item será removido permanentemente."
      confirmText={`Excluir ${label.toLowerCase()}`}
      onConfirm={handleDelete}
      trigger={
        <button className="cursor-pointer text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
          <Trash2 className="h-3 w-3" />
          Excluir
        </button>
      }
    />
  )
}
