import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, GenerateOptions } from './interface'

const THINKING_BUDGETS: Record<string, number> = {
  low:    0,      // no extended thinking
  medium: 5000,   // moderate
  high:   16000,  // deep
}

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-5',    label: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-3-5',   label: 'Claude Haiku 3.5' },
]

export class AnthropicProvider implements AIProvider {
  name = 'claude'
  model: string
  private client: Anthropic

  constructor(model?: string) {
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async generate(options: GenerateOptions): Promise<string> {
    const model = options.model ?? this.model
    const thinkingLevel = options.thinkingLevel ?? 'medium'
    const budget = THINKING_BUDGETS[thinkingLevel]

    const systemMsg = options.messages.find(m => m.role === 'system')
    const userMessages = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const baseParams = {
      model,
      system: systemMsg?.content,
      messages: userMessages,
    }

    // Extended thinking only on Opus/Sonnet, not Haiku
    const supportsThinking = !model.includes('haiku') && budget > 0
    if (supportsThinking) {
      const thinkingResponse = await this.client.messages.create({
        ...baseParams,
        max_tokens: (options.maxTokens ?? 1500) + budget,
        thinking: { type: 'enabled', budget_tokens: budget },
      } as Parameters<typeof this.client.messages.create>[0])
      const msg = thinkingResponse as { content: Array<{ type: string; text?: string }> }
      const block = msg.content.find(b => b.type === 'text')
      return block?.text ?? ''
    }

    const temps: Record<string, number> = { low: 0.3, medium: 0.7, high: 1.0 }
    const response = await this.client.messages.create({
      ...baseParams,
      max_tokens: options.maxTokens ?? 1500,
      temperature: temps[thinkingLevel],
    })
    const block = response.content[0]
    return block?.type === 'text' ? block.text : ''
  }
}
