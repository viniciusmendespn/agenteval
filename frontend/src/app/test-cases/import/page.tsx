"use client"
import { useRef, useState } from "react"
import {
  analyzeImport,
  uploadExtraFile,
  previewImport,
  confirmImport,
  type AnalyzeResult,
  type MappingRequest,
  type PreviewResult,
} from "@/lib/api"

type Step = "upload" | "mapping" | "preview" | "done"

const NONE = "__none__"

type ExtraFile = { file_id: string; filename: string; record_count: number }

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [extraFiles, setExtraFiles] = useState<ExtraFile[]>([])
  const [uploadingExtra, setUploadingExtra] = useState(false)

  // mapeamento
  const [inputPath, setInputPath] = useState("")
  const [outputPath, setOutputPath] = useState(NONE)
  const [titlePath, setTitlePath] = useState(NONE)
  const [contextPaths, setContextPaths] = useState<string[]>([])

  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const extraRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragOverExtra, setDragOverExtra] = useState(false)

  // -----------------------------------------------------------------------
  // Step 1 — Upload do arquivo principal (com IA)
  // -----------------------------------------------------------------------

  async function handleMainFile(file: File) {
    setError(null)
    setLoading(true)
    try {
      const result = await analyzeImport(file)
      setAnalysis(result)
      setExtraFiles([])
      setInputPath(result.suggestion.input_path ?? "")
      setOutputPath(result.suggestion.output_path ?? NONE)
      setContextPaths(result.suggestion.context_paths ?? [])
      setTitlePath(NONE)
      setStep("mapping")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleMainFile(f)
  }

  // -----------------------------------------------------------------------
  // Step 2 — Upload de arquivos extras (sem IA)
  // -----------------------------------------------------------------------

  async function handleExtraFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingExtra(true)
    setError(null)
    try {
      const results = await Promise.all(
        Array.from(files).map(f => uploadExtraFile(f))
      )
      setExtraFiles(prev => [...prev, ...results])
    } catch (e: any) {
      setError(`Erro ao adicionar arquivo: ${e.message}`)
    } finally {
      setUploadingExtra(false)
    }
  }

  function removeExtra(file_id: string) {
    setExtraFiles(prev => prev.filter(f => f.file_id !== file_id))
  }

  // -----------------------------------------------------------------------
  // Step 2 → 3 — Preview
  // -----------------------------------------------------------------------

  async function handlePreview() {
    if (!analysis || !inputPath) {
      setError("Selecione ao menos o campo de pergunta (input).")
      return
    }
    setError(null)
    setLoading(true)
    try {
      const result = await previewImport(buildMapping())
      setPreview(result)
      setStep("preview")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------
  // Step 3 → 4 — Confirm
  // -----------------------------------------------------------------------

  async function handleConfirm() {
    setError(null)
    setLoading(true)
    try {
      await confirmImport(buildMapping())
      setStep("done")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function buildMapping(): MappingRequest {
    return {
      file_ids: [analysis!.file_id, ...extraFiles.map(f => f.file_id)],
      input_path: inputPath,
      output_path: outputPath === NONE ? undefined : outputPath,
      context_paths: contextPaths,
      title_path: titlePath === NONE ? undefined : titlePath,
    }
  }

  function toggleContext(path: string) {
    setContextPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  const totalRecords = (analysis?.record_count ?? 0) + extraFiles.reduce((s, f) => s + f.record_count, 0)

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href="/test-cases" className="text-gray-400 hover:text-gray-600 text-sm">← Casos de Teste</a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Importar Dataset</h1>
      <p className="text-sm text-gray-500 mb-6">
        Suba um arquivo e a IA identificará automaticamente os campos. Depois você pode
        adicionar mais arquivos com o mesmo formato, sem chamar a IA novamente.
      </p>

      <StepIndicator current={step} />

      {/* ---- STEP 1: Upload principal ---- */}
      {step === "upload" && (
        <div
          className={`mt-6 border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
            ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file"
            accept=".json,.jsonl,.gz,.json.gz,.jsonl.gz"
            className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleMainFile(f) }} />
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
      )}

      {/* ---- STEP 2: Mapping ---- */}
      {step === "mapping" && analysis && (
        <div className="mt-6 space-y-5">

          {analysis.suggestion.reasoning && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Análise da IA</p>
              <p className="text-xs">{analysis.suggestion.reasoning}</p>
            </div>
          )}

          {/* Mapeamento de campos */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <p className="text-xs text-gray-400">
              Arquivo principal: <span className="font-medium text-gray-600">{analysis.record_count.toLocaleString()} registros</span>
            </p>

            <div>
              <label className={lbl}>Pergunta / Input <span className="text-red-500">*</span></label>
              <p className={hint}>Campo que contém a mensagem enviada pelo usuário ao agente.</p>
              <select className={inp} value={inputPath} onChange={e => setInputPath(e.target.value)}>
                <option value="">Selecione...</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Resposta do agente (histórica)</label>
              <p className={hint}>
                Campo com a resposta que o agente já deu. Ao executar a avaliação, esses casos
                não chamarão o agente novamente — a resposta importada será avaliada diretamente.
              </p>
              <select className={inp} value={outputPath} onChange={e => setOutputPath(e.target.value)}>
                <option value={NONE}>— não importar —</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Título do caso</label>
              <p className={hint}>Campo para usar como título. Se vazio, gerado automaticamente ("Caso #N").</p>
              <select className={inp} value={titlePath} onChange={e => setTitlePath(e.target.value)}>
                <option value={NONE}>— gerar automaticamente —</option>
                {analysis.all_paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Contexto / Trace</label>
              <p className={hint}>Campos com contexto ou trace de execução. Pode selecionar vários.</p>
              <div className="space-y-1 mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded p-2">
                {analysis.all_paths.map(p => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" className="rounded"
                      checked={contextPaths.includes(p)}
                      onChange={() => toggleContext(p)} />
                    <span className="text-xs text-gray-700 font-mono">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Arquivos adicionais */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Adicionar mais arquivos</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Arquivos com o mesmo formato — o mapeamento acima será reutilizado sem chamar a IA.
              </p>
            </div>

            {/* Lista de arquivos extras */}
            {extraFiles.length > 0 && (
              <div className="space-y-1">
                {extraFiles.map(f => (
                  <div key={f.file_id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{f.filename}</p>
                      <p className="text-xs text-gray-400">{f.record_count.toLocaleString()} registros</p>
                    </div>
                    <button onClick={() => removeExtra(f.file_id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone extra */}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
                ${dragOverExtra ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              onDragOver={e => { e.preventDefault(); setDragOverExtra(true) }}
              onDragLeave={() => setDragOverExtra(false)}
              onDrop={e => { e.preventDefault(); setDragOverExtra(false); handleExtraFiles(e.dataTransfer.files) }}
              onClick={() => extraRef.current?.click()}
            >
              <input ref={extraRef} type="file" multiple
                accept=".json,.jsonl,.gz,.json.gz,.jsonl.gz"
                className="hidden"
                onChange={e => handleExtraFiles(e.target.files)} />
              <p className="text-xs text-gray-500">
                {uploadingExtra ? "Enviando..." : "+ Arraste ou clique para adicionar arquivos"}
              </p>
            </div>

            {/* Contador total */}
            {extraFiles.length > 0 && (
              <p className="text-xs text-gray-500 text-right">
                Total: <span className="font-semibold text-gray-800">{totalRecords.toLocaleString()} registros</span>
                {" "}em {1 + extraFiles.length} arquivo(s)
              </p>
            )}
          </div>

          {/* Amostra bruta */}
          <details className="bg-gray-50 border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Ver amostra bruta do arquivo principal (3 registros)
            </summary>
            <pre className="px-4 pb-4 text-xs text-gray-600 overflow-auto max-h-64">
              {JSON.stringify(analysis.sample, null, 2)}
            </pre>
          </details>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")}
              className="flex-1 py-2.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
              Voltar
            </button>
            <button onClick={handlePreview} disabled={loading || !inputPath}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Carregando..." : "Ver preview →"}
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP 3: Preview ---- */}
      {step === "preview" && preview && (
        <div className="mt-6 space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                Preview — primeiros {preview.previews.length} registros
              </p>
              <p className="text-sm text-gray-500">
                Total a importar:{" "}
                <span className="font-semibold text-blue-600">{preview.record_count.toLocaleString()}</span> casos
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {preview.previews.map((p, i) => (
                <div key={i} className="px-5 py-4 space-y-1">
                  <p className="text-xs text-gray-400 font-medium">{p.title}</p>
                  <p className="text-sm text-gray-800 line-clamp-2">{p.input}</p>
                  {p.output && (
                    <p className="text-xs text-gray-500 line-clamp-1">
                      <span className="font-medium">Esperado:</span> {p.output}
                    </p>
                  )}
                  {p.context && p.context.length > 0 && (
                    <p className="text-xs text-blue-600">{p.context.length} item(s) de contexto</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep("mapping")}
              className="flex-1 py-2.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
              Ajustar mapeamento
            </button>
            <button onClick={handleConfirm} disabled={loading}
              className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium hover:bg-green-700 disabled:opacity-50">
              {loading
                ? "Importando..."
                : `Importar ${preview.record_count.toLocaleString()} casos`}
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP 4: Done ---- */}
      {step === "done" && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-10 text-center space-y-4">
          <p className="text-4xl">✅</p>
          <p className="text-lg font-semibold text-gray-800">Importação concluída!</p>
          <p className="text-sm text-gray-500">Os casos de teste foram adicionados ao dataset.</p>
          <a href="/test-cases"
            className="inline-block mt-2 bg-blue-600 text-white px-6 py-2.5 rounded font-medium hover:bg-blue-700 text-sm">
            Ver casos de teste
          </a>
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
            <span className={`text-xs ${i === idx ? "text-blue-700 font-semibold" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 ${i < idx ? "bg-blue-300" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

const lbl  = "block text-sm font-medium text-gray-700 mb-1"
const hint = "text-xs text-gray-400 mb-2 leading-relaxed"
const inp  = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
