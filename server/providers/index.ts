import type { AIProvider } from './interface'
import { MockProvider } from './mock'
import { AnthropicProvider, ANTHROPIC_MODELS } from './anthropic'
import { OpenAIProvider, OPENAI_MODELS } from './openai'
import { GeminiProvider, GEMINI_MODELS } from './gemini'

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'mock'

export interface RoleConfig {
  provider: ProviderName
  model: string
  thinkingLevel: 'low' | 'medium' | 'high'
}

/** Default provider (global fallback, no config) */
export function createProvider(): AIProvider {
  if (process.env.OPENAI_API_KEY)    return new OpenAIProvider()
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider()
  if (process.env.GEMINI_API_KEY)    return new GeminiProvider()
  return new MockProvider()
}

/** Provider for a specific role config */
export function createProviderFor(config: RoleConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        console.warn('[provider] OPENAI_API_KEY chybí — používám mock')
        return new MockProvider()
      }
      return new OpenAIProvider(config.model)

    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[provider] ANTHROPIC_API_KEY chybí — používám mock')
        return new MockProvider()
      }
      return new AnthropicProvider(config.model)

    case 'gemini':
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[provider] GEMINI_API_KEY chybí — používám mock')
        return new MockProvider()
      }
      return new GeminiProvider(config.model)

    default:
      return new MockProvider()
  }
}

/** Available providers/models for the frontend */
export const AVAILABLE_PROVIDERS = [
  {
    id: 'openai' as ProviderName,
    label: 'OpenAI',
    color: '#10a37f',
    models: OPENAI_MODELS,
    requiresKey: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic' as ProviderName,
    label: 'Claude',
    color: '#d97706',
    models: ANTHROPIC_MODELS,
    requiresKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'gemini' as ProviderName,
    label: 'Gemini',
    color: '#4285f4',
    models: GEMINI_MODELS,
    requiresKey: 'GEMINI_API_KEY',
  },
  {
    id: 'mock' as ProviderName,
    label: 'Mock',
    color: '#6b7280',
    models: [{ id: 'mock-cs-v1', label: 'Mock CS v1' }],
    requiresKey: null,
  },
]

export { type AIProvider } from './interface'
