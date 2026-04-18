"use client"

import * as RadixTooltip from "@radix-ui/react-tooltip"

export const TooltipProvider = RadixTooltip.Provider

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={300}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={4}
          className="z-50 max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg animate-fade-in"
        >
          {content}
          <RadixTooltip.Arrow className="fill-gray-900" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
