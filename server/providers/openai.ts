import { ProviderResponseError, type AIProvider, type APIKeys, type GenerateOptions } from './interface'
import { parseSSE } from './streamUtils'

// Fallback statický seznam — /api/models vrací živý aktuální seznam
export const OPENAI_MODELS = [
  { id: 'gpt-5.5',      label: 'GPT-5.5',        reasoning: true  },
  { id: 'gpt-5.4',      label: 'GPT-5.4',        reasoning: true  },
  { id: 'gpt-5-mini',   label: 'GPT-5 Mini',     reasoning: true  },
  { id: 'gpt-5-nano',   label: 'GPT-5 Nano',     reasoning: true  },
  { id: 'gpt-4.1',      label: 'GPT-4.1',        reasoning: false },
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
    this.model = model ?? process.env.OPENAI_MODEL ?? 'gpt-5.5'
    this.apiKey = keys?.openai || process.env.OPENAI_API_KEY
  }

  async generate(options: GenerateOptions): Promise<string> {
    const apiKey = this.apiKey
    if (!apiKey) throw new Error('OPENAI_API_KEY není nastavený.')

    const model = options.model ?? this.model
    const level = options.thinkingLevel ?? 'medium'
    const isReasoning = /^o\d/.test(model) || /^gpt-5/.test(model) || OPENAI_MODELS.find(m => m.id === model)?.reasoning === true

    if (isReasoning) {
      return this.generateViaResponsesApi(model, options, apiKey, level)
    }

    const body: Record<string, unknown> = {
      model,
      messages: options.messages.map(message => ({ role: message.role, content: message.content })),
      max_completion_tokens: options.maxTokens ?? 1500,
      temperature: TEMPERATURES[level],
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

  async *stream(options: GenerateOptions): AsyncGenerator<string> {
    const apiKey = this.apiKey
    if (!apiKey) throw new Error('OPENAI_API_KEY není nastavený.')

    const model = options.model ?? this.model
    const level = options.thinkingLevel ?? 'medium'
    const isReasoning = /^o\d/.test(model) || /^gpt-5/.test(model) || OPENAI_MODELS.find(m => m.id === model)?.reasoning === true

    if (isReasoning) {
      const body: Record<string, unknown> = {
        model,
        input: options.messages.map(message => ({
          role: message.role,
          content: [{ type: 'input_text', text: message.content }],
        })),
        max_output_tokens: options.maxTokens ?? 1500,
        reasoning: { effort: REASONING_EFFORT[level] },
        stream: true,
      }

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`OpenAI selhal (${response.status}): ${err.slice(0, 200)}`)
      }

      for await (const message of parseSSE(response)) {
        if (message.data === '[DONE]') break
        const payload = JSON.parse(message.data) as { type?: string; delta?: string }
        if (payload.type === 'response.output_text.delta' && payload.delta) {
          yield payload.delta
        }
      }
      return
    }

    const body: Record<string, unknown> = {
      model,
      messages: options.messages.map(message => ({ role: message.role, content: message.content })),
      max_completion_tokens: options.maxTokens ?? 1500,
      temperature: TEMPERATURES[level],
      stream: true,
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

    for await (const message of parseSSE(response)) {
      if (message.data === '[DONE]') break
      const payload = JSON.parse(message.data) as { choices?: Array<{ delta?: { content?: string } }> }
      const delta = payload.choices?.[0]?.delta?.content
      if (delta) yield delta
    }
  }

  private async generateViaResponsesApi(
    model: string,
    options: GenerateOptions,
    apiKey: string,
    level: string,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      input: options.messages.map(message => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
      max_output_tokens: options.maxTokens ?? 1500,
      reasoning: { effort: REASONING_EFFORT[level] },
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI selhal (${response.status}): ${err.slice(0, 200)}`)
    }

    const data = await response.json() as {
      output_text?: string
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
    }

    const text = data.output_text?.trim()
    if (text) return text

    const fallbackText = data.output
      ?.flatMap(item => item.content ?? [])
      .map(part => part.text ?? '')
      .join('')
      .trim()

    if (fallbackText) return fallbackText
    throw new ProviderResponseError(`OpenAI vrátilo prázdnou odpověď pro model ${model}.`)
  }
}
