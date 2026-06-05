/**
 * Live model fetching — queries each provider's API and returns the current
 * available models. Falls back to a curated list if the API is unreachable.
 * Results are cached for 24 hours so we don't hammer the APIs.
 */

export interface ModelInfo {
  id: string
  label: string
  provider: 'openai' | 'anthropic' | 'gemini'
  isReasoning?: boolean
  contextWindow?: number
}

export interface ProviderModels {
  provider: 'openai' | 'anthropic' | 'gemini'
  label: string
  color: string
  hasKey: boolean
  models: ModelInfo[]
  fetchedAt: string | null
  source: 'live' | 'fallback'
}

export interface APIKeys {
  openai?: string
  anthropic?: string
  gemini?: string
}

// ---- Curated fallbacks — nejnovější modely vždy první ----
// Aktualizováno: červen 2025

const FALLBACK_OPENAI: ModelInfo[] = [
  { id: 'gpt-5.5',      label: 'GPT-5.5',      provider: 'openai', isReasoning: true },
  { id: 'gpt-5.4',      label: 'GPT-5.4',      provider: 'openai', isReasoning: true },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai', isReasoning: true },
]

const FALLBACK_ANTHROPIC: ModelInfo[] = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6',   provider: 'anthropic' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  provider: 'anthropic' },
]

const FALLBACK_GEMINI: ModelInfo[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'gemini' },
  { id: 'gemini-3.1-pro',   label: 'Gemini 3.1 Pro',   provider: 'gemini' },
  { id: 'gemini-3-flash',   label: 'Gemini 3 Flash',   provider: 'gemini' },
]

// ---- Model ID → friendly label heuristics ----

function openAILabel(id: string): string {
  const map: Record<string, string> = {
    'gpt-5.5': 'GPT-5.5', 'gpt-5.4': 'GPT-5.4', 'gpt-5.4-mini': 'GPT-5.4 Mini', 'gpt-5.4-nano': 'GPT-5.4 Nano',
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

// Regex pro detekci reasoning modelů (o-série + budoucí)
const REASONING_PATTERN = /^o\d/

async function fetchOpenAIModels(keys?: APIKeys): Promise<ModelInfo[]> {
  const key = keys?.openai || process.env.OPENAI_API_KEY
  if (!key) return FALLBACK_OPENAI

  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!r.ok) return FALLBACK_OPENAI

  const data = await r.json() as { data: Array<{ id: string; created?: number }> }

  // Zahrň: gpt-4+, o-serie, gpt-5+ (budoucí)
  const keep = /^(gpt-5|gpt-[45]|o\d|chatgpt-4)/

  // Vylučuj: starší/specifické varianty
  const exclude = /audio|realtime|vision|turbo|instruct|dalle|tts|whisper|babbage|davinci|2023-|2022-/

  const models = data.data
    .filter(m => keep.test(m.id) && !exclude.test(m.id))
    .map(m => ({
      id: m.id,
      label: openAILabel(m.id),
      provider: 'openai' as const,
      isReasoning: REASONING_PATTERN.test(m.id),
      created: m.created ?? 0,
    }))

  // Seřaď: reasoning modely první (jsou nejnovější), pak standardní, vše od nejnovějšího
  models.sort((a, b) => {
    const aReason = REASONING_PATTERN.test(a.id)
    const bReason = REASONING_PATTERN.test(b.id)
    if (aReason && !bReason) return -1
    if (!aReason && bReason) return 1
    // V rámci skupiny: nejnovější (vyšší created) první
    return (b.created ?? 0) - (a.created ?? 0)
  })

  // Odstraň 'created' z výstupu
  const result = models.map(({ created: _c, ...m }) => m)
  return result.length >= 2 ? result : FALLBACK_OPENAI
}

async function fetchAnthropicModels(keys?: APIKeys): Promise<ModelInfo[]> {
  // Anthropic has a models list endpoint since v1
  const key = keys?.anthropic || process.env.ANTHROPIC_API_KEY
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

async function fetchGeminiModels(keys?: APIKeys): Promise<ModelInfo[]> {
  const key = keys?.gemini || process.env.GEMINI_API_KEY
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

function cacheKey(keys?: APIKeys) {
  return JSON.stringify({
    openai: !!keys?.openai,
    anthropic: !!keys?.anthropic,
    gemini: !!keys?.gemini,
  })
}

export async function fetchLiveModels(keys?: APIKeys): Promise<ProviderModels[]> {
  if (cache && Date.now() < cache.expiresAt && (cache as CacheEntry & { key?: string }).key === cacheKey(keys)) return cache.data

  const [openai, anthropic, gemini] = await Promise.all([
    fetchOpenAIModels(keys).catch(() => FALLBACK_OPENAI),
    fetchAnthropicModels(keys).catch(() => FALLBACK_ANTHROPIC),
    fetchGeminiModels(keys).catch(() => FALLBACK_GEMINI),
  ])

  const now = new Date().toISOString()

  const result: ProviderModels[] = [
    { provider: 'openai',    label: 'OpenAI',  color: '#10a37f', hasKey: !!(keys?.openai || process.env.OPENAI_API_KEY),       models: openai,    fetchedAt: now, source: openai === FALLBACK_OPENAI ? 'fallback' : 'live' },
    { provider: 'anthropic', label: 'Claude',  color: '#d97706', hasKey: !!(keys?.anthropic || process.env.ANTHROPIC_API_KEY), models: anthropic, fetchedAt: now, source: anthropic === FALLBACK_ANTHROPIC ? 'fallback' : 'live' },
    { provider: 'gemini',    label: 'Gemini',  color: '#4285f4', hasKey: !!(keys?.gemini || process.env.GEMINI_API_KEY),       models: gemini,    fetchedAt: now, source: gemini === FALLBACK_GEMINI ? 'fallback' : 'live' },
  ]

  cache = { data: result, expiresAt: Date.now() + CACHE_TTL, key: cacheKey(keys) } as CacheEntry & { key: string }
  return result
}
