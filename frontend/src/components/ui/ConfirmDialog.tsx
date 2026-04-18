"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogClose } from "./Dialog"
import { LoadingButton } from "./LoadingButton"
import { AlertTriangle } from "lucide-react"

interface ConfirmDialogProps {
  trigger: React.ReactNode
  title?: string
  description?: string
  confirmText?: string
  onConfirm: () => Promise<void> | void
  variant?: "danger" | "default"
}

export function ConfirmDialog({
  trigger,
  title = "Confirmar ação",
  description = "Tem certeza? Esta ação não pode ser desfeita.",
  confirmText = "Confirmar",
  onConfirm,
  variant = "danger",
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)} className="contents cursor-pointer">
        {trigger}
      </span>
      <DialogContent>
        <div className="flex items-start gap-3 mb-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </span>
          <div>
            <p className="font-bold text-gray-900">{title}</p>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <button className="flame-button-secondary cursor-pointer px-4 py-2 text-sm">
              Cancelar
            </button>
          </DialogClose>
          <LoadingButton
            variant="danger"
            isLoading={loading}
            loadingText="Excluindo…"
            onClick={handleConfirm}
          >
            {confirmText}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
