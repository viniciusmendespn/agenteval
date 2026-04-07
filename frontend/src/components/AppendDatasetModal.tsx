"use client"

import { useState } from "react"
import { Upload, X, ChevronRight, Check, AlertCircle } from "lucide-react"
import { analyzeImport, appendToDataset, type AnalyzeResult } from "@/lib/api"

type Props = {
  datasetId: number
  datasetName: string
  onClose: () => void
  onSuccess: (appended: number) => void
}

type Step = "upload" | "mapping" | "confirm"

export default function AppendDatasetModal({ datasetId, datasetName, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Upload step
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)

  // Mapping step
  const [inputPath, setInputPath] = useState("")
  const [outputPath, setOutputPath] = useState("")
  const [contextPaths, setContextPaths] = useState<string[]>([])

  // Confirm step
  const [appended, setAppended] = useState<number | null>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    try {
      const result = await analyzeImport(file)
      setAnalysis(result)
      setInputPath(result.suggestion.input_path ?? "")
      setOutputPath(result.suggestion.output_path ?? "")
      setContextPaths(result.suggestion.context_paths ?? [])
      setStep("mapping")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao analisar arquivo")
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!analysis || !inputPath) return
    setLoading(true)
    setError(null)
    try {
      const result = await appendToDataset({
        dataset_id: datasetId,
        file_ids: [analysis.file_id],
        input_path: inputPath,
        output_path: outputPath || undefined,
        context_paths: contextPaths,
      })
      setAppended(result.appended)
      setStep("confirm")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar registros")
    } finally {
      setLoading(false)
    }
  }

  function toggleContext(path: string) {
    setContextPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adicionar dados</h2>
            <p className="text-xs text-gray-500 mt-0.5">{datasetName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 text-xs text-gray-400">
          {(["upload", "mapping", "confirm"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`font-medium ${step === s ? "text-blue-600" : step === "confirm" && s !== "confirm" ? "text-green-600" : ""}`}>
                {i + 1}. {s === "upload" ? "Upload" : s === "mapping" ? "Mapeamento" : "Concluído"}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3" />}
            </span>
          ))}
        </div>

        <div className="px-6 py-5">
          {/* STEP 1: Upload */}
          {step === "upload" && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Selecione um arquivo JSON, JSONL ou JSONL.GZ para adicionar ao dataset. Os novos registros serão adicionados aos existentes.
              </p>
              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${loading ? "border-gray-200 bg-gray-50 cursor-not-allowed" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"}`}>
                <Upload className={`w-8 h-8 mb-3 ${loading ? "text-gray-300" : "text-gray-400"}`} />
                <span className="text-sm font-medium text-gray-700">
                  {loading ? "Analisando arquivo..." : "Clique para selecionar"}
                </span>
                <span className="text-xs text-gray-400 mt-1">JSON, JSONL, JSONL.GZ</span>
                <input
                  type="file"
                  accept=".json,.jsonl,.gz"
                  className="hidden"
                  disabled={loading}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                />
              </label>
              {error && (
                <div className="mt-3 flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Mapping */}
          {step === "mapping" && analysis && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700">
                <strong>{analysis.record_count}</strong> registros encontrados. Configure o mapeamento dos campos abaixo.
              </div>

              {/* Suggestion note */}
              {analysis.suggestion.reasoning && (
                <p className="text-xs text-gray-500 italic">{analysis.suggestion.reasoning}</p>
              )}

              {/* Input path */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Campo de input <span className="text-red-500">*</span></label>
                <select
                  value={inputPath}
                  onChange={e => setInputPath(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione...</option>
                  {analysis.all_paths.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Output path */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Campo de resposta <span className="text-gray-400">(opcional)</span>
                </label>
                <select
                  value={outputPath}
                  onChange={e => setOutputPath(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Nenhum</option>
                  {analysis.all_paths.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Context paths */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Campos de contexto <span className="text-gray-400">(opcional, múltiplos)</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {analysis.all_paths.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleContext(p)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        contextPaths.includes(p)
                          ? "bg-blue-100 border-blue-400 text-blue-700"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {analysis.sample[0] && inputPath && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">Preview do 1º registro:</p>
                  <p><span className="text-gray-400">input:</span> {String(analysis.sample[0][inputPath] ?? "—").slice(0, 100)}</p>
                  {outputPath && <p><span className="text-gray-400">resposta:</span> {String(analysis.sample[0][outputPath] ?? "—").slice(0, 100)}</p>}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Done */}
          {step === "confirm" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-base font-semibold text-gray-900">Dados adicionados!</p>
              <p className="text-sm text-gray-500 mt-1">
                <strong>{appended}</strong> novos registros foram adicionados ao dataset.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {step === "confirm" ? (
            <button
              onClick={() => onSuccess(appended ?? 0)}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Fechar e recarregar
            </button>
          ) : (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                Cancelar
              </button>
              {step === "mapping" && (
                <button
                  onClick={handleConfirm}
                  disabled={!inputPath || loading}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Adicionando..." : "Adicionar registros"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
