import type { Metadata } from "next"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import FloatingChat from "@/components/FloatingChat"
import WorkspaceGate from "@/components/WorkspaceGate"
import { Toaster } from "sonner"

export const metadata: Metadata = { title: "Santander AgentEval" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex bg-gray-50 h-screen overflow-hidden antialiased">
        <WorkspaceGate>
          <div className="sticky top-0 h-screen shrink-0">
            <Sidebar />
          </div>
          <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
          <FloatingChat />
        </WorkspaceGate>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
