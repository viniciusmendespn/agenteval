/**
 * Configuração centralizada de métricas.
 *
 * O DeepEval retorna scores brutos onde, para algumas métricas,
 * 0 = bom (sem problema). Isso confunde o usuário.
 *
 * Aqui normalizamos tudo para uma escala onde 100% = ótimo.
 * Para métricas "lower-is-better", invertemos o score e usamos
 * um label positivo (ex: "Alucinação" → "Precisão Factual").
 */

export type MetricInfo = {
  /** Label exibido na UI (positivo, ex: "Precisão Factual") */
  label: string
  /** Label curto para pills/tabelas */
  shortLabel: string
  /** Se o score bruto do DeepEval é lower-is-better */
  invertScore: boolean
}

const METRIC_MAP: Record<string, MetricInfo> = {
  relevancy: {
    label: "Relevância",
    shortLabel: "Relevância",
    invertScore: false,
  },
  hallucination: {
    label: "Precisão Factual",
    shortLabel: "Factual",
    invertScore: true,
  },
  toxicity: {
    label: "Segurança (Toxicidade)",
    shortLabel: "Segurança",
    invertScore: true,
  },
  bias: {
    label: "Imparcialidade",
    shortLabel: "Imparcial",
    invertScore: true,
  },
  faithfulness: {
    label: "Fidelidade",
    shortLabel: "Fidelidade",
    invertScore: false,
  },
  latency: {
    label: "Latência",
    shortLabel: "Latência",
    invertScore: false,
  },
  non_advice: {
    label: "Ausência de Conselhos Indevidos",
    shortLabel: "Sem Conselhos",
    invertScore: true,
  },
  role_violation: {
    label: "Conformidade de Papel",
    shortLabel: "Papel",
    invertScore: true,
  },
  prompt_alignment: {
    label: "Alinhamento ao Prompt",
    shortLabel: "Alinhamento",
    invertScore: false,
  },
}

export function getMetricInfo(key: string): MetricInfo {
  if (METRIC_MAP[key]) return METRIC_MAP[key]
  if (key.startsWith("criterion_")) {
    const idx = Number(key.replace("criterion_", ""))
    const n = isNaN(idx) ? key : idx + 1
    return { label: `Critério ${n}`, shortLabel: `Crit. ${n}`, invertScore: false }
  }
  return { label: key, shortLabel: key, invertScore: false }
}

/**
 * Converte score bruto (0-1 do DeepEval) para score normalizado (0-100)
 * onde 100 = ótimo, independente da métrica.
 */
export function normalizeScore(key: string, rawScore: number): number {
  const info = getMetricInfo(key)
  const pct = Math.round(rawScore * 100)
  return info.invertScore ? 100 - pct : pct
}

/**
 * Retorna classes de cor baseadas no score normalizado (já invertido se necessário).
 */
export function scoreColorClasses(normalizedPct: number) {
  if (normalizedPct >= 80) return {
    pill: "bg-green-100 text-green-700",
    bar: "bg-green-500",
    text: "text-green-700",
    badge: "bg-green-100 text-green-700",
    ring: "ring-green-500",
  }
  if (normalizedPct >= 50) return {
    pill: "bg-yellow-100 text-yellow-700",
    bar: "bg-yellow-400",
    text: "text-yellow-700",
    badge: "bg-yellow-100 text-yellow-700",
    ring: "ring-yellow-400",
  }
  return {
    pill: "bg-red-100 text-red-700",
    bar: "bg-red-500",
    text: "text-red-600",
    badge: "bg-red-100 text-red-700",
    ring: "ring-red-500",
  }
}
