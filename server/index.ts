import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { jsonrepair } from 'jsonrepair'
import { createProvider, createProviderFor, AVAILABLE_PROVIDERS, type RoleConfig } from './providers/index'
import { fetchLiveModels } from './liveModels'
import { ProviderConfigurationError, type APIKeys } from './providers/interface'

const app = express()
app.use(express.json())
const distPath = path.resolve(process.cwd(), 'dist')

function readApiKeys(body: unknown): APIKeys | undefined {
  const value = body as { apiKeys?: APIKeys } | undefined
  if (!value?.apiKeys) return undefined
  return value.apiKeys
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Generování se nezdařilo.'
}

function errorStatus(error: unknown): number {
  return error instanceof ProviderConfigurationError ? 400 : 500
}

function stripCodeFence(value: string) {
  return value.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

function extractJsonObject(value: string) {
  const stripped = stripCodeFence(value)
  const first = stripped.indexOf('{')
  const last = stripped.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return stripped
  return stripped.slice(first, last + 1)
}

async function parseJsonWithRepair<T>({
  raw,
  provider,
  repairPrompt,
}: {
  raw: string
  provider: ReturnType<typeof createProviderFor> | ReturnType<typeof createProvider>
  repairPrompt: string
}): Promise<T> {
  try {
    return JSON.parse(extractJsonObject(raw)) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(extractJsonObject(raw))) as T
    } catch {
      // fall through to model-assisted repair
    }

    const repaired = await provider.generate({
      messages: [
        {
          role: 'system',
          content: 'Vrať pouze validní JSON. Bez markdownu, bez komentáře, bez vysvětlení.',
        },
        {
          role: 'user',
          content: `${repairPrompt}\n\nNevalidní odpověď:\n${raw}`,
        },
      ],
      maxTokens: 500,
      thinkingLevel: 'low',
    })

    try {
      return JSON.parse(extractJsonObject(repaired)) as T
    } catch {
      return JSON.parse(jsonrepair(extractJsonObject(repaired))) as T
    }
  }
}

// ---- Providers & live models ----

app.get('/api/providers', (_req, res) => {
  const available = AVAILABLE_PROVIDERS.map(p => ({
    ...p,
    hasKey: p.requiresKey ? !!process.env[p.requiresKey] : true,
  }))
  res.json({ providers: available })
})

// Live models — queries each provider's models API, cached 24h
app.post('/api/models', async (req, res) => {
  try {
    const models = await fetchLiveModels(readApiKeys(req.body))
    res.json(models)
  } catch (err) {
    console.error('models error:', err)
    res.status(500).json({ error: 'Nepodařilo se načíst modely' })
  }
})

app.get('/api/health', (_req, res) => {
  try {
    const defaultProvider = createProvider()
    res.json({ ok: true, provider: defaultProvider.name, model: defaultProvider.model })
  } catch (error) {
    res.status(errorStatus(error)).json({ ok: false, error: errorMessage(error) })
  }
})

// ---- Pure chat (no system prompt, no roles) ----

app.post('/api/pure-chat', async (req, res) => {
  const { messages, modelConfig } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    modelConfig: RoleConfig
  }
  if (!messages?.length) return res.status(400).json({ error: 'Chybí messages' })

  try {
    const p = createProviderFor(modelConfig, readApiKeys(req.body))
    const content = await p.generate({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      maxTokens: 1500,
      thinkingLevel: modelConfig.thinkingLevel,
    })
    res.json({ content, providerName: p.name, modelName: modelConfig.model })
  } catch (err) {
    console.error('pure-chat error:', err)
    res.status(errorStatus(err)).json({ error: errorMessage(err) })
  }
})

// ---- Weakest Assumption ----

const WEAKEST_SYSTEM = `Jsi tvrdý, ale užitečný oponent. Tvým cílem je najít nejslabší předpoklad v nápadu nebo rozhodnutí uživatele.

Pravidla:
- Vyhýbej se obecným frázím. Každá kritika musí být konkrétní pro zadaný nápad.
- Nepovzbuzuj a nepochvaluj. Tvůj úkol je najít slabinu.
- Pokud nemáš dost informací, udělej rozumný předpoklad a označ ho jako předpoklad.
- Odpověď musí být konkrétní — pokud by šla použít na jakýkoli jiný nápad, je špatně.

Vrať odpověď POUZE jako validní JSON objekt (bez markdown kódového bloku) s těmito poli:
{
  "verdict": "pokračovat" | "upravit" | "nejdřív ověřit" | "zastavit",
  "verdictReason": "Jedna věta vysvětlující verdict.",
  "weakestAssumption": "Konkrétní předpoklad, který musí být pravdivý, jinak celý nápad padá.",
  "whyCritical": "Vysvětli konkrétně, co se stane, pokud tento předpoklad není pravdivý.",
  "blindSpot": "Co uživatel pravděpodobně podceňuje nebo si nalhává.",
  "firstTest": "Nejmenší konkrétní experiment, který lze udělat rychle a levně.",
  "killCriterion": "Konkrétní výsledek testu, který znamená zastavit nebo změnit nápad.",
  "nextStep": "Jedna konkrétní akce, kterou má uživatel udělat jako první."
}`

app.post('/api/weakest-assumption', async (req, res) => {
  const { prompt, refineAction, modelConfig } = req.body as { prompt: string; refineAction?: string; modelConfig?: RoleConfig }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  try {
    const provider = modelConfig ? createProviderFor(modelConfig, readApiKeys(req.body)) : createProvider(readApiKeys(req.body))
    const userContent = refineAction
      ? `Původní nápad: ${prompt}\n\nUživatel chce: ${refineAction}. Uprav odpověď podle tohoto požadavku.`
      : prompt

    const raw = await provider.generate({
      messages: [
        { role: 'system', content: WEAKEST_SYSTEM },
        { role: 'user', content: userContent },
      ],
      maxTokens: 800,
      thinkingLevel: modelConfig?.thinkingLevel,
    })

    const result = await parseJsonWithRepair({
      raw,
      provider,
      repairPrompt: `Oprav odpověď do JSON objektu přesně s poli: verdict, verdictReason, weakestAssumption, whyCritical, blindSpot, firstTest, killCriterion, nextStep. Původní prompt: ${userContent}`,
    })
    res.json(result)
  } catch (err) {
    console.error('weakest-assumption error:', err)
    res.status(errorStatus(err)).json({ error: errorMessage(err) })
  }
})

// ---- Three Answers ----

function makeRoleSystem(role: 'practical' | 'critical' | 'creative'): string {
  const roles = {
    practical: `Odpověz jako praktický poradce. Buď konkrétní, realistický a akční. Zaměř se na to, co má uživatel udělat dál. Vyhni se obecným radám — každé doporučení musí být konkrétní a proveditelné. Piš stručně a jasně, používej nadpisy pro strukturu. Odpovídej v češtině.`,
    critical: `Odpověz jako kritický oponent. Hledej slabiny, rizika, protiargumenty a věci, které uživatel přehlíží. Nebuď zbytečně negativní, ale buď tvrdý a konkrétní. Každou kritiku převeď na konkrétní riziko s dopadem. Vyhni se obecným frázím. Odpovídej v češtině.`,
    creative: `Odpověz jako kreativní stratég. Hledej alternativní řešení, nečekané možnosti a nové úhly pohledu. Buď užitečný, ne abstraktní. Navrhni konkrétní alternativy nebo rozšíření nápadu, která uživatel pravděpodobně nezvažoval. Odpovídej v češtině.`,
  }
  return roles[role]
}

app.post('/api/three-answers', async (req, res) => {
  const { prompt, history, roleConfigs } = req.body as {
    prompt: string
    history?: Array<{ role: 'user' | 'assistant'; content: string; persona: string }>
    roleConfigs?: Record<string, RoleConfig>
    apiKeys?: APIKeys
  }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  const roles: Array<'practical' | 'critical' | 'creative'> = ['practical', 'critical', 'creative']
  const roleLabels = { practical: 'Praktický poradce', critical: 'Kritický oponent', creative: 'Kreativní stratég' }

  const results = await Promise.allSettled(
    roles.map(async role => {
      const cfg = roleConfigs?.[role]
      const p = cfg ? createProviderFor(cfg, readApiKeys(req.body)) : createProvider(readApiKeys(req.body))
      const thinkingLevel = cfg?.thinkingLevel

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: makeRoleSystem(role) },
      ]

      if (history?.length) {
        const personaHistory = history.filter(h => h.persona === role || h.role === 'user')
        for (const h of personaHistory) messages.push({ role: h.role, content: h.content })
      } else {
        messages.push({ role: 'user', content: prompt })
      }
      if (history?.length) messages.push({ role: 'user', content: prompt })

      const content = await p.generate({ messages, maxTokens: 520, thinkingLevel })
      return { role, providerName: p.name, modelName: cfg?.model ?? p.model, content }
    })
  )

  const responses = results.map((r, i) => {
    const role = roles[i]
    if (r.status === 'fulfilled') {
      return { roleName: role, roleLabel: roleLabels[role], providerName: r.value.providerName, modelName: r.value.modelName, content: r.value.content, status: 'done', error: null }
    }
    const cfg = roleConfigs?.[role]
    return {
      roleName: role,
      roleLabel: roleLabels[role],
      providerName: cfg?.provider ?? 'unknown',
      modelName: cfg?.model ?? '',
      content: '',
      status: 'error',
      error: errorMessage(r.reason),
    }
  })

  res.json({ responses })
})

// ---- Council ----

const COUNCIL_ROLES = {
  practitioner: {
    label: 'Praktik',
    system: `Jsi Praktik v AI radě. Zaměřuješ se na proveditelnost, náklady, čas a realitu. Odpovídáš konkrétně, bez zbytečné teorie. Tvůj výstup musí obsahovat: co je reálné, kde jsou překážky a co má uživatel udělat jako první. Odpovídej v češtině.`,
  },
  skeptic: {
    label: 'Skeptik',
    system: `Jsi Skeptik v AI radě. Hledáš rizika, slabiny, slepé skvrny a protiargumenty. Každou kritiku formuluj jako konkrétní riziko s dopadem. Nebuď negativní pro negativitu — tvůj cíl je ochránit uživatele před špatným rozhodnutím. Odpovídej v češtině.`,
  },
  strategist: {
    label: 'Stratég',
    system: `Jsi Stratég v AI radě. Řešíš širší smysl, positioning, alternativy a dlouhodobou hodnotu. Hledáš nečekané příležitosti a alternativní cesty. Buď konkrétní, ne abstraktní. Odpovídej v češtině.`,
  },
}

const COUNCIL_WRAPUP_SYSTEM = `Jsi hodnotitel a předseda AI rady v jednom. Dostaneš otázku uživatele a odpovědi tří rádců.

Nejprve je stručně vyhodnoť a potom z nich udělej společný závěr.

Vrať POUZE validní JSON (bez markdown bloku):
{
  "evaluation": {
    "strengths": "Co bylo na odpovědích silné a správné.",
    "weaknesses": "Co bylo slabé nebo příliš obecné.",
    "missing": "Co důležitého v celé debatě chybí.",
    "bestArgument": "Nejdůležitější argument nebo poznatek z celé diskuse."
  },
  "synthesis": {
    "summary": "Stručné shrnutí v 2-3 větách.",
    "consensus": ["bod1", "bod2", "bod3"],
    "disagreements": ["bod1", "bod2"],
    "strongestArgument": "Nejsilnější argument z celé debaty.",
    "biggestRisk": "Největší riziko identifikované radou.",
    "missingInfo": "Informace, které by mohly změnit závěr.",
    "nextStep": "Jedna konkrétní akce.",
    "verdict": "pokračovat" | "upravit" | "nejdřív ověřit" | "zastavit"
  }
}`

app.post('/api/council', async (req, res) => {
  const { prompt, roleConfigs, synthesisConfig } = req.body as {
    prompt: string
    roleConfigs?: Record<string, RoleConfig>
    synthesisConfig?: RoleConfig
  }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  try {
    const apiKeys = readApiKeys(req.body)
    const councilRoles = Object.entries(COUNCIL_ROLES) as Array<[string, { label: string; system: string }]>
    const initialResults = await Promise.allSettled(
      councilRoles.map(([key, config]) => {
        const cfg = roleConfigs?.[key]
        const p = cfg ? createProviderFor(cfg, apiKeys) : createProvider(apiKeys)
        return p.generate({
          messages: [{ role: 'system', content: config.system }, { role: 'user', content: prompt }],
          maxTokens: 420,
          thinkingLevel: cfg?.thinkingLevel,
        }).then(content => ({ key, label: config.label, content, providerName: p.name, modelName: cfg?.model ?? p.model }))
      })
    )

    const initialResponses = initialResults.map((r, i) => {
      const [key, config] = councilRoles[i]
      const cfg = roleConfigs?.[key]
      return {
        roleName: key,
        roleLabel: config.label,
        providerName: r.status === 'fulfilled' ? r.value.providerName : (cfg?.provider ?? 'unknown'),
        modelName: r.status === 'fulfilled' ? r.value.modelName : (cfg?.model ?? ''),
        content: r.status === 'fulfilled' ? r.value.content : '',
        status: r.status === 'fulfilled' ? 'done' : 'error',
        error: r.status === 'fulfilled' ? null : errorMessage(r.reason),
      }
    })

    const responseSummary = initialResponses
      .map(r => `**${r.roleLabel}:** ${r.status === 'error' ? `(chyba) ${r.error}` : r.content}`)
      .join('\n\n')

    const successfulResponses = initialResponses.filter(r => r.status === 'done' && r.content.trim())
    if (successfulResponses.length === 0) {
      res.json({
        initialResponses,
        evaluation: null,
        synthesis: null,
        error: 'AI Council nemá žádnou platnou odpověď, ze které by mohl udělat závěr.',
      })
      return
    }

    const wrapupProvider = synthesisConfig
      ? createProviderFor(synthesisConfig, apiKeys)
      : createProvider(apiKeys)

    const wrapupRaw = await wrapupProvider.generate({
      messages: [
        { role: 'system', content: COUNCIL_WRAPUP_SYSTEM },
        { role: 'user', content: `Otázka: ${prompt}\n\n${responseSummary}` },
      ],
      maxTokens: 520,
      thinkingLevel: synthesisConfig?.thinkingLevel,
    })

    let evaluation = { strengths: '', weaknesses: '', missing: '', bestArgument: '' }
    const parsed = await parseJsonWithRepair<{
      evaluation?: typeof evaluation
      synthesis?: {
        summary: string
        consensus: string[]
        disagreements: string[]
        strongestArgument: string
        biggestRisk: string
        missingInfo: string
        nextStep: string
        verdict: 'pokračovat' | 'upravit' | 'nejdřív ověřit' | 'zastavit'
      }
    }>({
      raw: wrapupRaw,
      provider: wrapupProvider,
      repairPrompt: 'Oprav odpověď do JSON objektu s kořenovými poli evaluation a synthesis podle zadaného schématu AI Council.',
    })
    evaluation = parsed.evaluation ?? evaluation
    const synthesis = parsed.synthesis ?? null

    res.json({ initialResponses, evaluation, synthesis })
  } catch (err) {
    console.error('council error:', err)
    res.status(errorStatus(err)).json({ error: errorMessage(err) })
  }
})

if (existsSync(distPath)) {
  app.use(express.static(distPath))

  app.get('/{*all}', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next()
      return
    }

    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Export for Vercel serverless
export default app

// Start local server only when run directly (not imported by Vercel)
if (process.env.VERCEL !== '1') {
  const PORT = 3001
  app.listen(PORT, () => {
    console.log(`AI Council server running on http://localhost:${PORT}`)
  })
}
