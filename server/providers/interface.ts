export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ThinkingLevel = 'low' | 'medium' | 'high'

export interface APIKeys {
  openai?: string
  anthropic?: string
  gemini?: string
}

export interface GenerateOptions {
  messages: Message[]
  maxTokens?: number
  temperature?: number
  thinkingLevel?: ThinkingLevel
  model?: string  // override instance default
}

export interface AIProvider {
  name: string
  model: string
  generate(options: GenerateOptions): Promise<string>
  stream?(options: GenerateOptions): AsyncGenerator<string>
}
