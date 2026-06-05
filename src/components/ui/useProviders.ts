import { useEffect, useState } from 'react'
import type { APIKeys, ProviderName } from '../../types/index'

export interface LiveModel { id: string; label: string; isReasoning?: boolean }
export interface LiveProvider {
  provider: ProviderName
  label: string
  color: string
  hasKey: boolean
  models: LiveModel[]
  source: 'live' | 'fallback'
}

async function loadProviders(apiKeys: APIKeys): Promise<LiveProvider[]> {
  return fetch('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKeys }),
  })
    .then(response => response.json())
    .then(data => data as LiveProvider[])
    .catch(() => [] as LiveProvider[])
}

export function useProviders(apiKeys: APIKeys) {
  const [providers, setProviders] = useState<LiveProvider[]>([])

  useEffect(() => {
    loadProviders(apiKeys).then(setProviders)
  }, [apiKeys])

  return providers
}
