import { ProviderResponseError, type AIProvider, type APIKeys, type GenerateOptions } from './interface'

// Fallback statický seznam — /api/models vrací živý aktuální seznam
export const OPENAI_MODELS = [
  { id: 'gpt-5.5',      label: 'GPT-5.5',        reasoning: true  },
  { id: 'gpt-5.4',      label: 'GPT-5.4',        reasoning: true  },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini',   reasoning: true  },
]

const REASONING_EFFORT: Record<string, string> = {
  low: 'low', medium: 'medium', high: 'high',
}

const TEMPERATURES: Record<string, number> = {
  low: 0.3, medium: 0.7, high: 1.0,
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
    .trim()
}

export class OpenAIProvider implements AIProvider {
  name = 'openai'
  model: string
  private apiKey?: string

  constructor(model?: string, keys?: APIKeys) {
    this.model = model ?? process.env.OPENAI_MODEL ?? 'gpt-5.4'
    this.apiKey = keys?.openai || process.env.OPENAI_API_KEY
  }

  async generate(options: GenerateOptions): Promise<string> {
    const apiKey = this.apiKey
    if (!apiKey) throw new Error('OPENAI_API_KEY není nastavený.')

    const model = options.model ?? this.model
    const level = options.thinkingLevel ?? 'medium'
    // Detekuj reasoning model podle ID (o1, o2, o3, o4, o5... — obecný pattern)
    const isReasoning = /^o\d/.test(model) || OPENAI_MODELS.find(m => m.id === model)?.reasoning === true

    const systemMsg = options.messages.find(m => m.role === 'system')
    const userMessages = options.messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model,
      messages: [
        ...(systemMsg ? [{ role: 'system', content: systemMsg.content }] : []),
        ...userMessages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_completion_tokens: options.maxTokens ?? 1500,
    }

    if (isReasoning) {
      body.reasoning_effort = REASONING_EFFORT[level]
    } else {
      body.temperature = TEMPERATURES[level]
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI selhal (${response.status}): ${err.slice(0, 200)}`)
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown; refusal?: string | null } }> }
    const message = data.choices?.[0]?.message
    const content = extractTextContent(message?.content)

    if (content) return content
    if (message?.refusal) throw new ProviderResponseError(`OpenAI odmítlo odpovědět: ${message.refusal}`)
    throw new ProviderResponseError(`OpenAI vrátilo prázdnou odpověď pro model ${model}.`)
  }
}
