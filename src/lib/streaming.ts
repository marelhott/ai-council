type StreamHandlers = {
  onStart?: (payload: Record<string, unknown>) => void
  onDelta?: (payload: Record<string, unknown>) => void
  onDone?: (payload: Record<string, unknown>) => void
  onEvent?: (event: string, payload: Record<string, unknown>) => void
}

export async function streamJsonEvents(response: Response, handlers: StreamHandlers) {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error ?? `HTTP ${response.status}`)
  }

  if (!response.body) throw new Error('Chybí stream response body.')

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      let event = 'message'
      const dataLines: string[] = []

      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }

      if (dataLines.length === 0) continue
      const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
      handlers.onEvent?.(event, payload)

      if (event === 'start') handlers.onStart?.(payload)
      if (event === 'delta') handlers.onDelta?.(payload)
      if (event === 'done') handlers.onDone?.(payload)
      if (event === 'error') {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Stream selhal.')
      }
    }
  }
}

export async function streamChatCompletion({
  messages,
  modelConfig,
  apiKeys,
  maxTokens,
  onDelta,
  onStart,
}: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  modelConfig: { provider: string; model: string; thinkingLevel: string }
  apiKeys: unknown
  maxTokens?: number
  onDelta: (delta: string) => void
  onStart?: (payload: Record<string, unknown>) => void
}) {
  const response = await fetch('/api/pure-chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, modelConfig, apiKeys, maxTokens }),
  })

  let meta: { providerName?: string; modelName?: string } = {}
  await streamJsonEvents(response, {
    onStart: payload => {
      meta = payload ?? {}
      onStart?.(payload)
    },
    onDelta: payload => onDelta(typeof payload.delta === 'string' ? payload.delta : ''),
    onDone: payload => {
      meta = payload ?? meta
    },
  })

  return meta
}
