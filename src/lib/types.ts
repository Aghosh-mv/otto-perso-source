// Otto Perso — shared client types

export type AutonomyLevel = 1 | 2 | 3 | 4 | 5

export interface AutonomySetting {
  id: string
  level: number
  name: string
  tagline: string
  canDo: string[]
  cannotDo: string[]
  warnings: string[]
  isCurrent: boolean
  customRules?: Record<string, unknown>
}

export interface Task {
  id: string
  title: string
  description?: string | null
  status: 'queued' | 'planning' | 'executing' | 'waiting_approval' | 'done' | 'failed' | 'cancelled' | 'blocked'
  priority: 'low' | 'normal' | 'high' | 'critical'
  autonomyLevel: number
  runMode: 'foreground' | 'background' | 'parallel'
  assigneeId?: string | null
  assignee?: Agent | null
  modelId?: string | null
  recipeId?: string | null
  result?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export interface Agent {
  id: string
  name: string
  kind: 'main' | 'worker' | 'custom'
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'sleeping' | 'stopped'
  parentId?: string | null
  modelName?: string | null
  task?: string | null
  confidence: number
  spawnedAt: string
  lastBeatAt: string
  assignedTasks?: Task[]
}

export interface VaultNote {
  id: string
  title: string
  category: string
  tags: string
  frontmatter: string
  body: string
  filePath?: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface Credential {
  id: string
  label: string
  category: string
  issuer?: string | null
  maskedValue: string
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface ModelProvider {
  id: string
  name: string
  kind: 'ollama' | 'openai' | 'anthropic' | 'custom' | 'otto-bundled'
  endpoint?: string | null
  apiKeyRef?: string | null
  isDefault: boolean
  isActive: boolean
  models: string[]
  latencyMs: number
}

export interface Recipe {
  id: string
  title: string
  description: string
  category: string
  steps: RecipeStep[]
  estMinutes: number
  isBuiltIn: boolean
  isFavorite: boolean
  runCount: number
  createdAt: string
  updatedAt: string
}

export interface RecipeStep {
  action: string
  [k: string]: unknown
}

export interface ActivityLog {
  id: string
  agentId?: string | null
  agentName?: string | null
  action: string
  target?: string | null
  summary: string
  autonomyLevel: number
  riskTier: 'low' | 'medium' | 'high' | 'critical'
  undoable: boolean
  undone: boolean
  snapshotRef?: string | null
  createdAt: string
}

export interface ProactivePrompt {
  id: string
  content: string
  suggestedAction?: string | null
  trigger?: string | null
  confidence: number
  status: 'pending' | 'accepted' | 'dismissed' | 'snoozed'
  createdAt: string
}

export interface EmergencyStopState {
  active: boolean
  lastTriggered?: string | null
}

export interface RiskThresholds {
  autoApproveBelow: number
  askBetween: [number, number]
  alwaysAskBelow: number
  spendBudget24h: number
  emailBudget1h: number
}

// helpers
export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export function parseTags(tags: string): string[] {
  if (!tags) return []
  return tags.split(',').map((t) => t.trim()).filter(Boolean)
}

export function parseFrontmatter(fm: string): Record<string, unknown> {
  return parseJSON<Record<string, unknown>>(fm, {})
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
