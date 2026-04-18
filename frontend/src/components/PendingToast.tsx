"use client"
import { useEffect } from "react"
import { toast } from "sonner"

export function showAfterNav(message: string, type: "success" | "error" = "success") {
  sessionStorage.setItem("pendingToast", message)
  sessionStorage.setItem("pendingToastType", type)
}

export default function PendingToast() {
  useEffect(() => {
    const msg = sessionStorage.getItem("pendingToast")
    const type = sessionStorage.getItem("pendingToastType") || "success"
    if (msg) {
      sessionStorage.removeItem("pendingToast")
      sessionStorage.removeItem("pendingToastType")
      setTimeout(() => {
        if (type === "error") toast.error(msg)
        else toast.success(msg)
      }, 100)
    }
  }, [])
  return null
}
