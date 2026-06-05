import { ProviderResponseError, type AIProvider, type APIKeys, type GenerateOptions } from './interface'

export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash',     label: 'Gemini 3.5 Flash'     },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { id: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash'     },
  { id: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro'       },
]

const TEMPERATURES: Record<string, number> = {
  low: 0.2, medium: 0.45, high: 0.8,
}

export class GeminiProvider implements AIProvider {
  name = 'gemini'
  model: string
  private apiKey?: string

  constructor(model?: string, keys?: APIKeys) {
    this.model = model ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'
    this.apiKey = keys?.gemini || process.env.GEMINI_API_KEY
  }

  async generate(options: GenerateOptions): Promise<string> {
    const apiKey = this.apiKey
    if (!apiKey) throw new Error('GEMINI_API_KEY není nastavený.')

    const model = options.model ?? this.model
    const level = options.thinkingLevel ?? 'medium'
    const temp = TEMPERATURES[level]

    const systemMsg = options.messages.find(m => m.role === 'system')
    const userMessages = options.messages.filter(m => m.role !== 'system')

    // Build Gemini contents array
    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const body: Record<string, unknown> = {
      system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      contents,
      generationConfig: {
        temperature: temp,
        maxOutputTokens: options.maxTokens ?? 1500,
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini selhal (${response.status}): ${err.slice(0, 200)}`)
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
      promptFeedback?: { blockReason?: string }
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text ?? '')
      .join('')
      .trim()

    if (text) return text
    if (data.promptFeedback?.blockReason) {
      throw new ProviderResponseError(`Gemini odpověď zablokovalo: ${data.promptFeedback.blockReason}`)
    }
    throw new ProviderResponseError(`Gemini vrátilo prázdnou odpověď pro model ${model}.`)
  }
}
