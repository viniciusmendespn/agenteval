import { toast } from "sonner"

export const toastSuccess = (msg: string) => toast.success(msg)
export const toastError = (msg: string) => toast.error(msg)
export const toastWarning = (msg: string) => toast.warning(msg)
export const toastInfo = (msg: string) => toast.info(msg)

export function toastDeleteWithUndo(
  label: string,
  onUndo: () => void,
  duration = 5000
) {
  toast.success(`${label} excluído`, {
    duration,
    action: {
      label: "Desfazer",
      onClick: onUndo,
    },
  })
}
