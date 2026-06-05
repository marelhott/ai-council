/**
 * Live model fetching — queries each provider's API and returns the current
 * available models. Falls back to a curated list if the API is unreachable.
 * Results are cached for 24 hours so we don't hammer the APIs.
 */

export interface ModelInfo {
  id: string
  label: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'mock'
  isReasoning?: boolean
  contextWindow?: number
}

export interface ProviderModels {
  provider: 'openai' | 'anthropic' | 'gemini' | 'mock'
  label: string
  color: string
  hasKey: boolean
  models: ModelInfo[]
  fetchedAt: string | null
  source: 'live' | 'fallback'
}

// ---- Curated fallbacks (kept up-to-date as known defaults) ----

const FALLBACK_OPENAI: ModelInfo[] = [
  { id: 'gpt-4.1',       label: 'GPT-4.1',        provider: 'openai', isReasoning: false },
  { id: 'gpt-4.1-mini',  label: 'GPT-4.1 Mini',   provider: 'openai', isReasoning: false },
  { id: 'gpt-4o',        label: 'GPT-4o',          provider: 'openai', isReasoning: false },
  { id: 'o3',            label: 'o3',              provider: 'openai', isReasoning: true  },
  { id: 'o4-mini',       label: 'o4-mini',         provider: 'openai', isReasoning: true  },
]

const FALLBACK_ANTHROPIC: ModelInfo[] = [
  { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5',   provider: 'anthropic' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-3-5',  label: 'Claude Haiku 3.5',  provider: 'anthropic' },
]

const FALLBACK_GEMINI: ModelInfo[] = [
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   provider: 'gemini' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash',  provider: 'gemini' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash',  provider: 'gemini' },
]

const MOCK_MODELS: ModelInfo[] = [
  { id: 'mock-cs-v1', label: 'Mock (demo)', provider: 'mock' },
]

// ---- Model ID → friendly label heuristics ----

function openAILabel(id: string): string {
  const map: Record<string, string> = {
    'gpt-4.1': 'GPT-4.1', 'gpt-4.1-mini': 'GPT-4.1 Mini', 'gpt-4.1-nano': 'GPT-4.1 Nano',
    'gpt-4o': 'GPT-4o', 'gpt-4o-mini': 'GPT-4o Mini',
    'o1': 'o1', 'o1-mini': 'o1 Mini', 'o1-pro': 'o1 Pro',
    'o3': 'o3', 'o3-mini': 'o3 Mini', 'o3-pro': 'o3 Pro',
    'o4-mini': 'o4-mini', 'o4': 'o4',
  }
  return map[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function geminiLabel(id: string): string {
  // "models/gemini-2.5-pro-preview-05-06" → "Gemini 2.5 Pro"
  return id
    .replace('models/', '')
    .replace(/-preview.*$/, '')
    .replace(/-exp.*$/, '')
    .replace(/-latest.*$/, '')
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// ---- Live fetchers ----

const REASONING_IDS = new Set(['o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini', 'o3-pro', 'o4', 'o4-mini'])

async function fetchOpenAIModels(): Promise<ModelInfo[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return FALLBACK_OPENAI

  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!r.ok) return FALLBACK_OPENAI

  const data = await r.json() as { data: Array<{ id: string }> }
  const keep = /^(gpt-4|gpt-4\.1|o1|o2|o3|o4|gpt-4o)/

  const models = data.data
    .filter(m => keep.test(m.id))
    .filter(m => !m.id.includes('audio') && !m.id.includes('realtime') && !m.id.includes('preview') && !m.id.includes('vision') && !m.id.includes('turbo') && !m.id.includes('2024') && !m.id.includes('2023'))
    .map(m => ({
      id: m.id,
      label: openAILabel(m.id),
      provider: 'openai' as const,
      isReasoning: REASONING_IDS.has(m.id),
    }))

  // Sort: put flagship models first
  const ORDER = ['gpt-4.1', 'gpt-4o', 'o4-mini', 'o3', 'o4', 'gpt-4.1-mini']
  models.sort((a, b) => {
    const ai = ORDER.indexOf(a.id), bi = ORDER.indexOf(b.id)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.id.localeCompare(b.id)
  })

  return models.length >= 2 ? models : FALLBACK_OPENAI
}

async function fetchAnthropicModels(): Promise<ModelInfo[]> {
  // Anthropic has a models list endpoint since v1
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return FALLBACK_ANTHROPIC

  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return FALLBACK_ANTHROPIC

    const data = await r.json() as { data: Array<{ id: string; display_name?: string }> }
    const models = data.data
      .filter(m => m.id.startsWith('claude-'))
      .map(m => ({
        id: m.id,
        label: m.display_name ?? m.id.replace('claude-', 'Claude ').replace(/-/g, ' '),
        provider: 'anthropic' as const,
      }))

    return models.length >= 1 ? models : FALLBACK_ANTHROPIC
  } catch {
    return FALLBACK_ANTHROPIC
  }
}

async function fetchGeminiModels(): Promise<ModelInfo[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return FALLBACK_GEMINI

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=50`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) return FALLBACK_GEMINI

    const data = await r.json() as { models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> }
    const models = data.models
      .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
      .filter(m => !m.name.includes('embedding') && !m.name.includes('aqa') && !m.name.includes('vision'))
      .map(m => ({
        id: m.name.replace('models/', ''),
        label: m.displayName ?? geminiLabel(m.name),
        provider: 'gemini' as const,
      }))

    // Sort: newer/bigger first
    models.sort((a, b) => b.id.localeCompare(a.id))
    return models.length >= 1 ? models : FALLBACK_GEMINI
  } catch {
    return FALLBACK_GEMINI
  }
}

// ---- Cache ----

interface CacheEntry {
  data: ProviderModels[]
  expiresAt: number
}

let cache: CacheEntry | null = null
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

export async function fetchLiveModels(): Promise<ProviderModels[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.data

  const [openai, anthropic, gemini] = await Promise.all([
    fetchOpenAIModels().catch(() => FALLBACK_OPENAI),
    fetchAnthropicModels().catch(() => FALLBACK_ANTHROPIC),
    fetchGeminiModels().catch(() => FALLBACK_GEMINI),
  ])

  const now = new Date().toISOString()

  const result: ProviderModels[] = [
    { provider: 'openai',    label: 'OpenAI',  color: '#10a37f', hasKey: !!process.env.OPENAI_API_KEY,    models: openai,    fetchedAt: now, source: process.env.OPENAI_API_KEY    ? 'live' : 'fallback' },
    { provider: 'anthropic', label: 'Claude',  color: '#d97706', hasKey: !!process.env.ANTHROPIC_API_KEY, models: anthropic, fetchedAt: now, source: process.env.ANTHROPIC_API_KEY ? 'live' : 'fallback' },
    { provider: 'gemini',    label: 'Gemini',  color: '#4285f4', hasKey: !!process.env.GEMINI_API_KEY,    models: gemini,    fetchedAt: now, source: process.env.GEMINI_API_KEY    ? 'live' : 'fallback' },
    { provider: 'mock',      label: 'Mock',    color: '#6b7280', hasKey: true,                            models: MOCK_MODELS, fetchedAt: now, source: 'fallback' },
  ]

  cache = { data: result, expiresAt: Date.now() + CACHE_TTL }
  return result
}
