import { ProviderConfigurationError, type AIProvider, type APIKeys } from './interface'
import { AnthropicProvider, ANTHROPIC_MODELS } from './anthropic'
import { OpenAIProvider, OPENAI_MODELS } from './openai'
import { GeminiProvider, GEMINI_MODELS } from './gemini'

export type ProviderName = 'openai' | 'anthropic' | 'gemini'

export interface RoleConfig {
  provider: ProviderName
  model: string
  thinkingLevel: 'low' | 'medium' | 'high'
}

function hasKey(value?: string) {
  return !!value?.trim()
}

/** Default provider (global fallback, no config) */
export function createProvider(apiKeys?: APIKeys): AIProvider {
  if (hasKey(apiKeys?.openai) || process.env.OPENAI_API_KEY) return new OpenAIProvider(undefined, apiKeys)
  if (hasKey(apiKeys?.anthropic) || process.env.ANTHROPIC_API_KEY) return new AnthropicProvider(undefined, apiKeys)
  if (hasKey(apiKeys?.gemini) || process.env.GEMINI_API_KEY) return new GeminiProvider(undefined, apiKeys)
  throw new ProviderConfigurationError('Není nastaven žádný API klíč. Doplň OpenAI, Claude nebo Gemini v nastavení nebo ve Vercel env.')
}

/** Provider for a specific role config */
export function createProviderFor(config: RoleConfig, apiKeys?: APIKeys): AIProvider {
  switch (config.provider) {
    case 'openai':
      if (!hasKey(apiKeys?.openai) && !process.env.OPENAI_API_KEY) {
        throw new ProviderConfigurationError('OpenAI není nastavené. Doplň `OPENAI_API_KEY` nebo vlož OpenAI klíč v nastavení.')
      }
      return new OpenAIProvider(config.model, apiKeys)

    case 'anthropic':
      if (!hasKey(apiKeys?.anthropic) && !process.env.ANTHROPIC_API_KEY) {
        throw new ProviderConfigurationError('Claude není nastavený. Doplň `ANTHROPIC_API_KEY` nebo vlož Anthropic klíč v nastavení.')
      }
      return new AnthropicProvider(config.model, apiKeys)

    case 'gemini':
      if (!hasKey(apiKeys?.gemini) && !process.env.GEMINI_API_KEY) {
        throw new ProviderConfigurationError('Gemini není nastavené. Doplň `GEMINI_API_KEY` nebo vlož Gemini klíč v nastavení.')
      }
      return new GeminiProvider(config.model, apiKeys)
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
]

export { type AIProvider } from './interface'
