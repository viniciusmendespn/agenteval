"use client"

import * as RadixDialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

interface DialogContentProps {
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
}

export function DialogContent({ children, title, description, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl outline-none animate-fade-in",
          className
        )}
      >
        {title && (
          <RadixDialog.Title className="mb-1 text-base font-bold text-gray-900">
            {title}
          </RadixDialog.Title>
        )}
        {description && (
          <RadixDialog.Description className="mb-4 text-sm text-gray-500">
            {description}
          </RadixDialog.Description>
        )}
        {children}
        <RadixDialog.Close asChild>
          <button
            className="absolute right-4 top-4 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
