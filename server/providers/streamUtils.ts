export async function* parseSSE(response: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!response.body) return

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

      if (dataLines.length > 0) {
        yield { event, data: dataLines.join('\n') }
      }
    }
  }

  const finalChunk = buffer.trim()
  if (!finalChunk) return

  let event = 'message'
  const dataLines: string[] = []
  for (const line of finalChunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length > 0) {
    yield { event, data: dataLines.join('\n') }
  }
}
