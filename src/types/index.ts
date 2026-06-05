export type Mode = 'weakest_assumption' | 'three_answers' | 'council'
export type ResponseStatus = 'pending' | 'done' | 'error'
export type Verdict = 'pokračovat' | 'upravit' | 'nejdřív ověřit' | 'zastavit'
export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'mock'
export type ThinkingLevel = 'low' | 'medium' | 'high'

export interface ModelOption { id: string; label: string }
export interface ProviderOption {
  id: ProviderName
  label: string
  color: string
  models: ModelOption[]
  hasKey: boolean
  requiresKey?: string | null
}

export interface RoleConfig {
  provider: ProviderName
  model: string
  thinkingLevel: ThinkingLevel
}

// ---- Weakest Assumption ----

export interface WeakestAssumptionResult {
  verdict: Verdict
  verdictReason: string
  weakestAssumption: string
  whyCritical: string
  blindSpot: string
  firstTest: string
  killCriterion: string
  nextStep: string
}

export interface WeakestAssumptionState {
  status: ResponseStatus
  result: WeakestAssumptionResult | null
  error: string | null
}

// ---- Three Answers ----

export interface RoleResponse {
  roleName: string
  roleLabel: string
  providerName: string
  modelName: string
  content: string
  status: ResponseStatus
  error: string | null
}

export interface ConversationRound {
  id: string
  userPrompt: string
  responses: RoleResponse[]
  createdAt: string
}

export interface ThreeAnswersSession {
  rounds: ConversationRound[]
  loading: boolean
}

// ---- Council ----

export interface CouncilMemberResponse {
  roleName: string
  roleLabel: string
  providerName: string
  modelName: string
  content: string
  status: ResponseStatus
}

export interface CouncilEvaluation {
  evaluatorRole: string
  strengths: string
  weaknesses: string
  missing: string
  bestArgument: string
}

export interface CouncilSynthesis {
  summary: string
  consensus: string[]
  disagreements: string[]
  strongestArgument: string
  biggestRisk: string
  missingInfo: string
  nextStep: string
  verdict: Verdict
}

export interface CouncilSession {
  status: 'idle' | 'initial_responses' | 'evaluating' | 'synthesizing' | 'done' | 'error'
  initialResponses: CouncilMemberResponse[]
  evaluations: CouncilEvaluation[]
  synthesis: CouncilSynthesis | null
  error: string | null
}

// ---- API Payloads ----

export interface WeakestAssumptionPayload {
  prompt: string
  refineAction?: string
}

export interface ThreeAnswersPayload {
  prompt: string
  history?: Array<{ role: 'user' | 'assistant'; content: string; persona: string }>
}

export interface CouncilPayload {
  prompt: string
}
