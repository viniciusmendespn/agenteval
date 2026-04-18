import { cn } from "@/lib/cn"

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer",
        className
      )}
    />
  )
}

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  columns: number
  rows?: number
}) {
  return (
    <div className="flame-panel overflow-hidden" aria-label="Carregando dados">
      <table className="flame-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, index) => (
              <th key={index} className="px-5 py-3">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((_, column) => (
                <td key={column} className="px-5 py-4">
                  <Skeleton
                    className={cn(
                      "h-4",
                      column === 0 ? "w-12" : "w-full max-w-[180px]",
                      column === columns - 1 ? "ml-auto w-16" : ""
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Carregando dados">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flame-panel p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-48" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-36 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function WorkspaceListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-100" aria-label="Carregando workspaces">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-10 w-10" />
            <div className="min-w-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-9 w-16" />
        </div>
      ))}
    </div>
  )
}
