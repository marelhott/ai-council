import type { AIProvider, GenerateOptions } from './interface.ts'

export const OPENAI_MODELS = [
  { id: 'gpt-4.1',      label: 'GPT-4.1',       reasoning: false },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini',  reasoning: false },
  { id: 'o4-mini',      label: 'o4 Mini',        reasoning: true  },
  { id: 'o3',           label: 'o3',             reasoning: true  },
]

const REASONING_EFFORT: Record<string, string> = {
  low: 'low', medium: 'medium', high: 'high',
}

const TEMPERATURES: Record<string, number> = {
  low: 0.3, medium: 0.7, high: 1.0,
}

export class OpenAIProvider implements AIProvider {
  name = 'openai'
  model: string

  constructor(model?: string) {
    this.model = model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
  }

  async generate(options: GenerateOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY není nastavený.')

    const model = options.model ?? this.model
    const level = options.thinkingLevel ?? 'medium'
    const isReasoning = OPENAI_MODELS.find(m => m.id === model)?.reasoning ?? false

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

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
  }
}
