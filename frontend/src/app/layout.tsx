import type { Metadata } from "next"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import FloatingChat from "@/components/FloatingChat"
import { Toaster } from "sonner"

export const metadata: Metadata = { title: "AgentEval" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex bg-gray-50 h-screen overflow-hidden">
        <div className="sticky top-0 h-screen shrink-0">
          <Sidebar />
        </div>
        <main className="flex-1 p-8 overflow-y-auto min-w-0">{children}</main>
        <Toaster richColors position="top-right" />
        <FloatingChat />
      </body>
    </html>
  )
}
