"use client"
import { useRef, useState } from "react"
import {
  analyzeImport, uploadExtraFile, previewImport, confirmImport,
  type AnalyzeResult, type MappingRequest, type PreviewResult,
} from "@/lib/api"

type Step = "upload" | "mapping" | "preview" | "done"
const NONE = "__none__"
type ExtraFile = { file_id: string; filename: string; record_count: number }

export default function ImportDatasetPage() {
  const [step, setStep] = useState<Step>("upload")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [extraFiles, setExtraFiles] = useState<ExtraFile[]>([])
  const [uploadingExtra, setUploadingExtra] = useState(false)

  // dataset info
  const [datasetName, setDatasetName] = useState("")
  const [datasetDescription, setDatasetDescription] = useState("")

  // mapeamento
  const [inputPath, setInputPath] = useState("")
  const [outputPath, setOutputPath] = useState(NONE)
  const [contextPaths, setContextPaths] = useState<string[]>([])
  const [manualContext, setManualContext] = useState("")
  const [sessionIdPath, setSessionIdPath] = useState(NONE)
  const [orderPath, setOrderPath] = useState(NONE)

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [createdDatasetId, setCreatedDatasetId] = useState<number | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const extraRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverExtra, setDragOverExtra] = useState(false)

  async function handleMainFile(file: File) {
    setError(null); setLoading(true)
    try {
      const result = await analyzeImport(file)
      setAnalysis(result)
      setExtraFiles([])
      setInputPath(result.suggestion.input_path ?? "")
      setOutputPath(result.suggestion.output_path ?? NONE)
      setContextPaths(result.suggestion.context_paths ?? [])
      setSessionIdPath(result.suggestion.session_id_path ?? NONE)
      setOrderPath(result.suggestion.order_path ?? NONE)
      if (!datasetName) setDatasetName(file.name.replace(/\.(json|jsonl|gz)+$/i, ""))
      setStep("mapping")
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleExtraFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingExtra(true); setError(null)
    try {
      const results = await Promise.all(Array.from(files).map(f => uploadExtraFile(f)))
      setExtraFiles(prev => [...prev, ...results])
    } catch (e: any) { setError(`Erro ao adicionar arquivo: ${e.message}`) }
    finally { setUploadingExtra(false) }
  }

  async function handlePreview() {
    if (!inputPath) { setError("Selecione o campo de input."); return }
    if (!datasetName.trim()) { setError("Informe um nome para o dataset."); return }
    setError(null); setLoading(true)
    try {
      const result = await previewImport(buildMapping())
      setPreview(result)
      setStep("preview")
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleConfirm() {
    setError(null); setLoading(true)
    try {
      const result = await confirmImport(buildMapping())
      setCreatedDatasetId(result.dataset_id)
      setStep("done")
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function buildMapping(): MappingRequest {
    return {
      dataset_name: datasetName.trim(),
      dataset_description: datasetDescription.trim() || undefined,
      file_ids: [analysis!.file_id, ...extraFiles.map(f => f.file_id)],
      input_path: inputPath,
      output_path: outputPath === NONE ? undefined : outputPath,
      context_paths: contextPaths,
      manual_context: manualContext.trim() || undefined,
      session_id_path: sessionIdPath === NONE ? undefined : sessionIdPath,
      order_path: orderPath === NONE ? undefined : orderPath,
    }
  }

  function toggleContext(path: string) {
    setContextPaths(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
  }

  const totalRecords = (analysis?.record_count ?? 0) + extraFiles.reduce((s, f) => s + f.record_count, 0)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href="/datasets" className="text-gray-400 hover:text-gray-600 text-sm">← Datasets</a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Importar Dataset</h1>
      <p className="text-sm text-gray-500 mb-6">
        Suba um arquivo e a IA identificará automaticamente os campos.
        As respostas importadas serão avaliadas sem chamar nenhum agente.
      </p>

      <StepIndicator current={step} />

      {/* STEP 1 — Upload */}
      {step === "upload" && (
        <div className="mt-6 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div>
              <label className={lbl}>Nome do dataset *</label>
              <input className={inp} value={datasetName}
                onChange={e => setDatasetName(e.target.value)}
                placeholder="Ex: Logs Suporte Junho" />
            </div>
            <div>
              <label className={lbl}>Descrição</label>
              <input className={inp} value={datasetDescription}
                onChange={e => setDatasetDescription(e.target.value)}
                placeholder="Opcional" />
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
              ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleMainFile(f) }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".json,.jsonl,.gz" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleMainFile(f) }} />
            <p className="text-4xl mb-3">📂</p>
            <p className="text-sm font-medium text-gray-700">
              {loading ? "Analisando com IA..." : "Arraste um arquivo ou clique para selecionar"}
            </p>
            <p className="text-xs text-gray-400 mt-1">.json · .jsonl · .json.gz · .jsonl.gz</p>
            {loading && (
              <div className="mt-4 flex justify-center">
                <div className="h-1 w-48 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {/* STEP 2 — Mapping */}
      {step === "mapping" && analysis && (
        <div className="mt-6 space-y-5">
          {analysis.suggestion.reasoning && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-800 mb-1">Análise da IA</p>
              <p className="text-xs text-blue-700">{analysis.suggestion.reasoning}</p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <p className="text-xs text-gray-400">
              Arquivo principal: <span className="font-medium text-gray-600">{analysis.record_count.toLocaleString()} registros</span>
            </p>

            <div>
              <label className={lbl}>Nome do dataset *</label>
              <input className={inp} value={datasetName} onChange={e => setDatasetName(e.target.value)} required />
            </div>

            <div>
              <label className={lbl}>Input (pergunta ao agente) *</label>
              <p className={hint}>Campo com a mensagem enviada pelo usuário.</p>
              <select className={inp} value={inputPath} onChange={e => setInputPath(e.target.value)}>
                <option value="">Selecione...</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Resposta do agente</label>
              <p className={hint}>Campo com a resposta que o agente já deu. Será avaliada pelas métricas.</p>
              <select className={inp} value={outputPath} onChange={e => setOutputPath(e.target.value)}>
                <option value={NONE}>— não importar —</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Session ID <span className="text-gray-400 font-normal">(opcional)</span></label>
              <p className={hint}>Campo que identifica a sessão ou conversa. Registros com o mesmo valor serão agrupados.</p>
              <select className={inp} value={sessionIdPath} onChange={e => setSessionIdPath(e.target.value)}>
                <option value={NONE}>— não importar —</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Ordenação <span className="text-gray-400 font-normal">(opcional)</span></label>
              <p className={hint}>Campo que define a ordem das mensagens dentro de uma sessão. Pode ser número, timestamp ou data.</p>
              <select className={inp} value={orderPath} onChange={e => setOrderPath(e.target.value)}>
                <option value={NONE}>— não importar —</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={lbl} style={{marginBottom: 0}}>Contexto / Trace</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setContextPaths(analysis.all_paths)}
                    className="text-xs text-blue-600 hover:text-blue-800">Selecionar todos</button>
                  <span className="text-gray-300 text-xs">|</span>
                  <button type="button" onClick={() => setContextPaths([])}
                    className="text-xs text-gray-400 hover:text-gray-600">Limpar</button>
                </div>
              </div>
              <p className={hint}>Campos com documentos recuperados ou trace de execução. Pode selecionar vários.</p>
              <div className="space-y-1 mt-1 max-h-40 overflow-y-auto border border-gray-100 rounded p-2">
                {analysis.all_paths.map(p => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" className="rounded" checked={contextPaths.includes(p)} onChange={() => toggleContext(p)} />
                    <span className="text-xs text-gray-700 font-mono">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Contexto manual</label>
              <p className={hint}>Texto aplicado a todos os registros importados, combinado com os campos selecionados acima.</p>
              <textarea
                className={`${inp} min-h-24 resize-y`}
                value={manualContext}
                onChange={e => setManualContext(e.target.value)}
                placeholder="Ex: regras, politica, documento base ou instrucoes comuns para todos os arquivos"
              />
            </div>
          </div>

          {/* Arquivos extras */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Adicionar mais arquivos</p>
              <p className="text-xs text-gray-400 mt-0.5">Mesmo formato — mapeamento reutilizado sem chamar a IA.</p>
            </div>
            {extraFiles.length > 0 && (
              <div className="space-y-1">
                {extraFiles.map(f => (
                  <div key={f.file_id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{f.filename}</p>
                      <p className="text-xs text-gray-400">{f.record_count.toLocaleString()} registros</p>
                    </div>
                    <button onClick={() => setExtraFiles(prev => prev.filter(x => x.file_id !== f.file_id))}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
                  </div>
                ))}
                <p className="text-xs text-gray-500 text-right pt-1">
                  Total: <span className="font-semibold text-gray-800">{totalRecords.toLocaleString()} registros</span>{" "}em {1 + extraFiles.length} arquivo(s)
                </p>
              </div>
            )}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
                ${dragOverExtra ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              onDragOver={e => { e.preventDefault(); setDragOverExtra(true) }}
              onDragLeave={() => setDragOverExtra(false)}
              onDrop={e => { e.preventDefault(); setDragOverExtra(false); handleExtraFiles(e.dataTransfer.files) }}
              onClick={() => extraRef.current?.click()}
            >
              <input ref={extraRef} type="file" multiple accept=".json,.jsonl,.gz" className="hidden"
                onChange={e => handleExtraFiles(e.target.files)} />
              <p className="text-xs text-gray-500">
                {uploadingExtra ? "Enviando..." : "+ Arraste ou clique para adicionar arquivos"}
              </p>
            </div>
          </div>

          <details className="bg-gray-50 border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Ver amostra bruta (3 registros)
            </summary>
            <pre className="px-4 pb-4 text-xs text-gray-600 overflow-auto max-h-64">
              {JSON.stringify(analysis.sample, null, 2)}
            </pre>
          </details>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 py-2.5 border border-gray-300 rounded text-sm hover:bg-gray-50">Voltar</button>
            <button onClick={handlePreview} disabled={loading || !inputPath || !datasetName.trim()}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Carregando..." : "Ver preview →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Preview */}
      {step === "preview" && preview && (
        <div className="mt-6 space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Preview — primeiros {preview.previews.length} registros</p>
              <p className="text-sm text-gray-500">
                Total: <span className="font-semibold text-blue-600">{preview.record_count.toLocaleString()}</span>
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {preview.previews.map((p, i) => (
                <div key={i} className="px-5 py-4 space-y-1">
                  <p className="text-sm text-gray-800 line-clamp-2">{p.input}</p>
                  {p.output && <p className="text-xs text-gray-500 line-clamp-1"><span className="font-medium">Resposta:</span> {p.output}</p>}
                  {p.context && p.context.length > 0 && <p className="text-xs text-blue-600">{p.context.length} contexto(s)</p>}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("mapping")} className="flex-1 py-2.5 border border-gray-300 rounded text-sm hover:bg-gray-50">Ajustar mapeamento</button>
            <button onClick={handleConfirm} disabled={loading}
              className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium hover:bg-green-700 disabled:opacity-50">
              {loading ? "Importando..." : `Criar dataset com ${preview.record_count.toLocaleString()} registros`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Done */}
      {step === "done" && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-10 text-center space-y-4">
          <p className="text-4xl">✅</p>
          <p className="text-lg font-semibold text-gray-800">Dataset criado!</p>
          <p className="text-sm text-gray-500">Agora você pode avaliá-lo com um perfil de métricas.</p>
          <div className="flex gap-3 justify-center mt-2">
            {createdDatasetId && (
              <a href={`/datasets/${createdDatasetId}/evaluate`}
                className="bg-blue-600 text-white px-5 py-2.5 rounded font-medium hover:bg-blue-700 text-sm">
                Avaliar agora
              </a>
            )}
            <a href="/datasets" className="border border-gray-300 px-5 py-2.5 rounded text-sm hover:bg-gray-50">
              Ver datasets
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "mapping", label: "Mapeamento" },
    { key: "preview", label: "Preview" },
    { key: "done", label: "Concluído" },
  ]
  const idx = steps.findIndex(s => s.key === current)
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${i < idx ? "bg-blue-600 text-white" : i === idx ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-gray-200 text-gray-500"}`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-xs ${i === idx ? "text-blue-700 font-semibold" : "text-gray-400"}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-px mx-2 ${i < idx ? "bg-blue-300" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  )
}

const lbl  = "block text-sm font-medium text-gray-700 mb-1"
const hint = "text-xs text-gray-400 mb-2 leading-relaxed"
const inp  = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
