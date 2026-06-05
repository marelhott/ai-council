import type { ProviderName, RoleConfig } from '../../types/index'
import type { LiveProvider } from './useProviders'

export function getProviderLabel(provider: ProviderName) {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'anthropic') return 'Claude'
  if (provider === 'gemini') return 'Gemini'
  return provider
}

function humanizeModelId(modelId: string) {
  if (modelId.startsWith('gpt-')) {
    return modelId.replace(/^gpt-/, 'GPT ')
  }

  if (modelId.startsWith('claude-')) {
    return modelId
      .replace(/^claude-/, 'Claude ')
      .replace(/-(\d)-(\d)\b/g, ' $1.$2')
      .replace(/-/g, ' ')
  }

  if (modelId.startsWith('gemini-')) {
    return modelId
      .replace(/^gemini-/, 'gemini ')
      .replace(/-/g, ' ')
  }

  return modelId
}

export function getModelLabel(config: Pick<RoleConfig, 'provider' | 'model'>, providers: LiveProvider[]) {
  const provider = providers.find(item => item.provider === config.provider)
  return provider?.models.find(model => model.id === config.model)?.label ?? humanizeModelId(config.model)
}
