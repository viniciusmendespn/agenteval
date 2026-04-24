"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Upload, Trash2, ChevronDown, ChevronUp, Save } from "lucide-react"
import { getDataset, updateDataset, syncDatasetPrompt, bulkDeleteRecords, type DatasetDetail, type DatasetRecord } from "@/lib/api"
import AppendDatasetModal from "@/components/AppendDatasetModal"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

// Two subtle background tints that alternate between sessions
const SESSION_TINTS = ["bg-blue-50/30", "bg-amber-50/30"]

export default function DatasetPage() {
  const params = useParams()
  const id = Number(params.id)

  const [ds, setDs] = useState<DatasetDetail | null>(null)
  const [showAppend, setShowAppend] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptEdit, setPromptEdit] = useState("")
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [syncingPrompt, setSyncingPrompt] = useState(false)

  const load = useCallback(() => {
    getDataset(id).then(data => {
      setDs(data)
      setSelected(new Set())
    }).catch(() => setDs(null))
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (ds) setPromptEdit(ds.system_prompt ?? "") }, [ds?.system_prompt])

  // Detect session data and sort by (session_id, turn_order) if present
  const { sortedRecords, hasSessionData } = useMemo(() => {
    if (!ds) return { sortedRecords: [], hasSessionData: false }
    const hasSession = ds.records.some(r => r.session_id != null)
    if (!hasSession) return { sortedRecords: ds.records, hasSessionData: false }
    const sorted = [...ds.records].sort((a, b) => {
      const sidCmp = (a.session_id ?? "").localeCompare(b.session_id ?? "")
      if (sidCmp !== 0) return sidCmp
      return (a.turn_order ?? 0) - (b.turn_order ?? 0)
    })
    return { sortedRecords: sorted, hasSessionData: true }
  }, [ds])

  // Assign a tint index per unique session_id
  const sessionTintMap = useMemo(() => {
    const map: Record<string, number> = {}
    let idx = 0
    for (const r of sortedRecords) {
      if (r.session_id && !(r.session_id in map)) {
        map[r.session_id] = idx++ % SESSION_TINTS.length
      }
    }
    return map
  }, [sortedRecords])

  const allIds = ds?.records.map(r => r.id) ?? []
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allIds))
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSavePrompt() {
    if (!ds) return
    setSavingPrompt(true)
    try {
      await updateDataset(ds.id, { system_prompt: promptEdit || undefined })
      load()
    } finally {
      setSavingPrompt(false)
    }
  }

  async function handleSyncPrompt() {
    if (!ds) return
    setSyncingPrompt(true)
    try {
      await syncDatasetPrompt(ds.id)
      load()
    } finally {
      setSyncingPrompt(false)
    }
  }

  async function handleDeleteSelected() {
    if (!ds || selected.size === 0) return
    const confirmed = window.confirm(
      `Excluir ${selected.size} registro(s) selecionado(s)? Esta ação não pode ser desfeita.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await bulkDeleteRecords(ds.id, Array.from(selected))
      load()
    } finally {
      setDeleting(false)
    }
  }

  if (!ds) return <div className="text-gray-400 text-sm">Carregando...</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Breadcrumb items={[{ label: "Datasets", href: "/datasets" }, { label: ds.name }]} />
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{ds.name}</h1>
          {ds.description && <p className="text-sm text-gray-500 mt-0.5">{ds.description}</p>}
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-gray-400">{ds.records.length.toLocaleString()} registros</p>
            {ds.agent_name && (
              <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                Vinculado a: {ds.agent_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAppend(true)}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Adicionar dados
          </button>
          <Link href={`/datasets/${ds.id}/evaluate`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            Avaliar dataset
          </Link>
        </div>
      </div>

      {/* System Prompt */}
      <div className="mb-4 flame-panel overflow-hidden">
        <button
          onClick={() => setShowPrompt(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span>
            System Prompt do Dataset
            {ds.system_prompt && <span className="ml-2 text-xs text-green-600 font-normal">configurado</span>}
          </span>
          {showPrompt ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {showPrompt && (
          <div className="px-5 pb-4 space-y-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 pt-3">
              Contexto global injetado em todas as avaliações deste dataset. Use para descrever as instruções do agente que gerou as respostas.
            </p>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none font-mono min-h-[100px]"
              value={promptEdit}
              onChange={e => setPromptEdit(e.target.value)}
              placeholder="Ex: Você é um assistente de suporte bancário. Responda sempre com empatia e clareza..."
            />
            <div className="flex items-center justify-between">
              {ds.agent_id && (
                <button
                  type="button"
                  onClick={handleSyncPrompt}
                  disabled={syncingPrompt}
                  className="text-xs text-teal-600 hover:text-teal-800 underline disabled:opacity-50"
                >
                  {syncingPrompt ? "Sincronizando..." : "Sincronizar system prompt do agente"}
                </button>
              )}
              <div className="ml-auto">
                <button
                  onClick={handleSavePrompt}
                  disabled={savingPrompt}
                  className="flame-button flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingPrompt ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <span className="text-sm text-blue-700 font-medium">
            {selected.size} registro(s) selecionado(s)
          </span>
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? "Excluindo..." : "Excluir selecionados"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700 ml-auto"
          >
            Limpar seleção
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
              {hasSessionData && (
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Session</th>
              )}
              {hasSessionData && (
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-14">Turno</th>
              )}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Input</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Resposta</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Contexto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedRecords.map((r, i) => {
              const sessionTint = r.session_id != null
                ? SESSION_TINTS[sessionTintMap[r.session_id] ?? 0]
                : ""
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${selected.has(r.id) ? "bg-blue-50/60" : sessionTint}`}
                  onClick={() => toggleOne(r.id)}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  {hasSessionData && (
                    <td className="px-4 py-3">
                      {r.session_id
                        ? <span className="text-xs font-mono text-gray-500 block truncate max-w-[96px]" title={r.session_id}>
                            {r.session_id.length > 12 ? `${r.session_id.slice(0, 12)}…` : r.session_id}
                          </span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  )}
                  {hasSessionData && (
                    <td className="px-4 py-3">
                      {r.turn_order != null
                        ? <span className="text-xs text-gray-600">{r.turn_order}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-800 line-clamp-2">{r.input}</p>
                  </td>
                  <td className="px-4 py-3">
                    {r.actual_output
                      ? <p className="text-xs text-gray-600 line-clamp-2">{r.actual_output}</p>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.context && r.context.length > 0
                      ? <span className="text-xs text-blue-600">{r.context.length} item(s)</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {ds.records.length === 0 && (
          <div className="p-10 text-center text-gray-400 text-sm">Nenhum registro neste dataset.</div>
        )}
      </div>

      {showAppend && (
        <AppendDatasetModal
          datasetId={ds.id}
          datasetName={ds.name}
          onClose={() => setShowAppend(false)}
          onSuccess={() => {
            setShowAppend(false)
            load()
          }}
        />
      )}
    </div>
  )
}
