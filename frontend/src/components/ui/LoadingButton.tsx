"use client"

import { cn } from "@/lib/cn"
import { Spinner } from "./Spinner"

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  loadingText?: string
  variant?: "primary" | "secondary" | "danger"
}

const variants = {
  primary: "flame-button",
  secondary: "flame-button-secondary",
  danger: "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-600 bg-red-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
}

export function LoadingButton({
  isLoading,
  loadingText,
  variant = "primary",
  children,
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={cn(variants[variant], "cursor-pointer", className)}
    >
      {isLoading ? (
        <>
          <Spinner size="xs" />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  )
}
