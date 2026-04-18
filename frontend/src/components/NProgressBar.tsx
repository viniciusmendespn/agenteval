"use client"

import { useEffect, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import NProgress from "nprogress"

NProgress.configure({ showSpinner: false, trickleSpeed: 200, minimum: 0.08 })

function ProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    NProgress.done()
  }, [pathname, searchParams])

  return null
}

export default function NProgressBar() {
  return (
    <>
      <style>{`
        #nprogress { pointer-events: none; }
        #nprogress .bar {
          position: fixed; top: 0; left: 0; z-index: 9999;
          width: 100%; height: 2px;
          background: #ec0000;
          box-shadow: 0 0 6px rgba(236,0,0,0.5);
        }
      `}</style>
      <Suspense fallback={null}>
        <ProgressInner />
      </Suspense>
    </>
  )
}
