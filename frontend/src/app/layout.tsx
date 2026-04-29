import type { Metadata } from "next"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import FloatingChat from "@/components/FloatingChat"
import WorkspaceGate from "@/components/WorkspaceGate"
import VersionChecker from "@/components/VersionChecker"
import { Toaster } from "sonner"
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react"
import PendingToast from "@/components/PendingToast"
import { TooltipProvider } from "@/components/ui/Tooltip"
import { PageTransition } from "@/components/ui/PageTransition"
import NProgressBar from "@/components/NProgressBar"

export const metadata: Metadata = {
  title: "Santander AgentEval",
  icons: { icon: "/logo-santander.png" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex bg-gray-50 h-screen overflow-hidden antialiased">
        <NProgressBar />
        <VersionChecker />
        <TooltipProvider>
          <WorkspaceGate>
            <div className="sticky top-0 h-screen shrink-0">
              <Sidebar />
            </div>
            <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
              <PendingToast />
              <PageTransition>{children}</PageTransition>
            </main>
            <FloatingChat />
          </WorkspaceGate>
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          closeButton
          icons={{
            success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
            error: <XCircle className="w-5 h-5 text-red-500" />,
            warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
            info: <Info className="w-5 h-5 text-blue-500" />,
          }}
          toastOptions={{
            style: {
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              fontSize: "0.875rem",
              background: "#ffffff",
              color: "#111827",
            },
          }}
        />
      </body>
    </html>
  )
}
