export type AppMode = 'weakest_assumption' | 'three_answers' | 'council'

export type Verdict = 'pokračovat' | 'upravit' | 'nejdřív ověřit' | 'zastavit'

export type ResponseStatus = 'pending' | 'streaming' | 'done' | 'error'

export interface Session {
  id: string
  mode: AppMode
  title: string
  createdAt: string
  updatedAt: string
  rounds: Round[]
}

export interface Round {
  id: string
  userPrompt: string
  responses: Response[]
  synthesis?: Synthesis
  createdAt: string
}

export interface Response {
  id: string
  roleName: string
  providerName: string
  modelName: string
  content: string
  status: ResponseStatus
}

export interface Synthesis {
  content: string
  verdict?: Verdict
  weakestAssumption?: string
  nextStep?: string
}
