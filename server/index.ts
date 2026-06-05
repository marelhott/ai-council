import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createProvider, createProviderFor, AVAILABLE_PROVIDERS, type RoleConfig } from './providers/index.ts'

const app = express()
app.use(express.json())

const defaultProvider = createProvider()
const distPath = path.resolve(process.cwd(), 'dist')

// Expose available providers + which keys are set
app.get('/api/providers', (_req, res) => {
  const available = AVAILABLE_PROVIDERS.map(p => ({
    ...p,
    hasKey: p.requiresKey ? !!process.env[p.requiresKey] : true,
  }))
  res.json({ providers: available })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: defaultProvider.name, model: defaultProvider.model })
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
  const { prompt, refineAction } = req.body as { prompt: string; refineAction?: string }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  try {
    const userContent = refineAction
      ? `Původní nápad: ${prompt}\n\nUživatel chce: ${refineAction}. Uprav odpověď podle tohoto požadavku.`
      : prompt

    const raw = await provider.generate({
      messages: [
        { role: 'system', content: WEAKEST_SYSTEM },
        { role: 'user', content: userContent },
      ],
      maxTokens: 1200,
    })

    // Parse JSON from response
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(jsonStr)
    res.json(result)
  } catch (err) {
    console.error('weakest-assumption error:', err)
    res.status(500).json({ error: 'Generování se nezdařilo' })
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
  }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  const roles: Array<'practical' | 'critical' | 'creative'> = ['practical', 'critical', 'creative']
  const roleLabels = { practical: 'Praktický poradce', critical: 'Kritický oponent', creative: 'Kreativní stratég' }

  const results = await Promise.allSettled(
    roles.map(async role => {
      const cfg = roleConfigs?.[role]
      const p = cfg ? createProviderFor(cfg) : defaultProvider
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

      const content = await p.generate({ messages, maxTokens: 800, thinkingLevel })
      return { role, providerName: p.name, modelName: cfg?.model ?? p.model, content }
    })
  )

  const responses = results.map((r, i) => {
    const role = roles[i]
    if (r.status === 'fulfilled') {
      return { roleName: role, roleLabel: roleLabels[role], providerName: r.value.providerName, modelName: r.value.modelName, content: r.value.content, status: 'done', error: null }
    }
    const cfg = roleConfigs?.[role]
    const fallbackProvider = cfg ? createProviderFor(cfg) : defaultProvider
    return { roleName: role, roleLabel: roleLabels[role], providerName: fallbackProvider.name, modelName: cfg?.model ?? fallbackProvider.model, content: '', status: 'error', error: 'Tato odpověď se nepodařila vygenerovat.' }
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

const EVALUATION_SYSTEM = `Jsi hodnotitel v AI radě. Dostaneš původní otázku a odpovědi tří rádců. Zhodnoť jejich odpovědi.

Vrať POUZE validní JSON (bez markdown bloku):
{
  "strengths": "Co bylo na odpovědích silné a správné.",
  "weaknesses": "Co bylo slabé nebo příliš obecné.",
  "missing": "Co důležitého v celé debatě chybí.",
  "bestArgument": "Nejdůležitější argument nebo poznatek z celé diskuse."
}`

const SYNTHESIS_SYSTEM = `Jsi Předseda AI rady. Tvůj úkol je syntetizovat — ne přidávat další názor. Dostaneš otázku uživatele a výstupy tří rádců + hodnocení.

Vrať POUZE validní JSON (bez markdown bloku):
{
  "summary": "Stručné shrnutí v 2-3 větách.",
  "consensus": ["bod1", "bod2", "bod3"],
  "disagreements": ["bod1", "bod2"],
  "strongestArgument": "Nejsilnější argument z celé debaty.",
  "biggestRisk": "Největší riziko identifikované radou.",
  "missingInfo": "Informace, které by mohly změnit závěr.",
  "nextStep": "Jedna konkrétní akce.",
  "verdict": "pokračovat" | "upravit" | "nejdřív ověřit" | "zastavit"
}`

app.post('/api/council', async (req, res) => {
  const { prompt, roleConfigs } = req.body as { prompt: string; roleConfigs?: Record<string, RoleConfig> }
  if (!prompt?.trim()) return res.status(400).json({ error: 'Chybí prompt' })

  try {
    const councilRoles = Object.entries(COUNCIL_ROLES) as Array<[string, { label: string; system: string }]>
    const initialResults = await Promise.allSettled(
      councilRoles.map(([key, config]) => {
        const cfg = roleConfigs?.[key]
        const p = cfg ? createProviderFor(cfg) : defaultProvider
        return p.generate({
          messages: [{ role: 'system', content: config.system }, { role: 'user', content: prompt }],
          maxTokens: 700,
          thinkingLevel: cfg?.thinkingLevel,
        }).then(content => ({ key, label: config.label, content, providerName: p.name, modelName: cfg?.model ?? p.model }))
      })
    )

    const initialResponses = initialResults.map((r, i) => {
      const [key, config] = councilRoles[i]
      const cfg = roleConfigs?.[key]
      const fallback = cfg ? createProviderFor(cfg) : defaultProvider
      return {
        roleName: key,
        roleLabel: config.label,
        providerName: r.status === 'fulfilled' ? r.value.providerName : fallback.name,
        modelName: r.status === 'fulfilled' ? r.value.modelName : (cfg?.model ?? fallback.model),
        content: r.status === 'fulfilled' ? r.value.content : '',
        status: r.status === 'fulfilled' ? 'done' : 'error',
      }
    })

    // Step 2: Evaluation
    const responseSummary = initialResponses
      .map(r => `**${r.roleLabel}:** ${r.content}`)
      .join('\n\n')

    const evalRaw = await provider.generate({
      messages: [
        { role: 'system', content: EVALUATION_SYSTEM },
        { role: 'user', content: `Otázka: ${prompt}\n\n${responseSummary}` },
      ],
      maxTokens: 600,
    })

    let evaluation = { strengths: '', weaknesses: '', missing: '', bestArgument: '' }
    try {
      const evalJson = evalRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      evaluation = JSON.parse(evalJson)
    } catch {
      console.warn('Nepodařilo se parseovat evaluation JSON, použiju fallback texty.')
    }

    // Step 3: Synthesis
    const synthInput = `Otázka: ${prompt}\n\n${responseSummary}\n\nHodnocení debaty:\nSilné: ${evaluation.strengths}\nSlabé: ${evaluation.weaknesses}\nChybí: ${evaluation.missing}\nNejlepší argument: ${evaluation.bestArgument}`

    const synthRaw = await provider.generate({
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: synthInput },
      ],
      maxTokens: 900,
    })

    let synthesis = null
    try {
      const synthJson = synthRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      synthesis = JSON.parse(synthJson)
    } catch {
      synthesis = {
        summary: synthRaw,
        consensus: [],
        disagreements: [],
        strongestArgument: '',
        biggestRisk: '',
        missingInfo: '',
        nextStep: '',
        verdict: 'nejdřív ověřit',
      }
    }

    res.json({ initialResponses, evaluation, synthesis })
  } catch (err) {
    console.error('council error:', err)
    res.status(500).json({ error: 'Generování se nezdařilo' })
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
