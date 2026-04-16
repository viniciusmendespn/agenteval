"use client"
import { useEffect, useRef, useState } from "react"
import { API } from "@/lib/api"

export default function VersionChecker() {
  const initialBuild = useRef<number | null>(null)
  const [updateInfo, setUpdateInfo] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch(`${API}/version`)
      .then(r => r.json())
      .then(data => { initialBuild.current = data.build })
      .catch(() => {})

    const interval = setInterval(() => {
      fetch(`${API}/version`)
        .then(r => r.json())
        .then(data => {
          const initial = initialBuild.current
          if (initial !== null && data.build > initial) {
            setUpdateInfo(`v${data.version} build ${data.build}`)
          }
        })
        .catch(() => {})
    }, 3 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  if (!updateInfo || dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-amber-400 px-4 py-2 text-sm font-medium text-amber-900 shadow">
      <span>
        Nova versão disponível ({updateInfo}). Recarregue a página para aplicar as atualizações.
      </span>
      <div className="ml-4 flex shrink-0 gap-4">
        <button onClick={() => window.location.reload()} className="underline hover:no-underline">
          Recarregar agora
        </button>
        <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  )
}
