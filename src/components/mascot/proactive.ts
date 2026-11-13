// Lok proactive engine — makes Lok an independent agent that pops in on its own
// schedule, prompts the user even when unprompted, can message multiple times,
// and surfaces drafts/work it did while the user was away.
//
// "They should be like independent at max — show up wherever they like,
//  whenever they like. First prompt u even if u didnt prompt to it. Message
//  more than 1 time if wanted. Produce and draft stuffs."

export type ProactiveAction = 'open-vault' | 'open-tasks' | 'open-drafts' | 'open-wardrobe' | 'chat' | 'dismiss'

export type Proactive = {
  id: string
  mood: string
  message: string
  cta?: { label: string; action: ProactiveAction }
  weight: number // higher = more likely
}

// Scenarios Lok picks from. Some offer a draft/result (clickable CTA into the app).
export const PROACTIVES: Proactive[] = [
  { id: 'greet',    mood: 'happy',   message: "Hey — I'm here. Anything you want me to take care of?", cta: { label: 'Chat', action: 'chat' }, weight: 3 },
  { id: 'draft',    mood: 'think',   message: "I drafted a reply to that email while you were away. Want to look?", cta: { label: 'Open draft', action: 'open-vault' }, weight: 2 },
  { id: 'report',   mood: 'content', message: "Put together a short research summary on the hotels you asked about. Saved to the vault.", cta: { label: 'See it', action: 'open-vault' }, weight: 2 },
  { id: 'remind',   mood: 'alert',   message: "Heads up — you've got something at 3pm in about 20 minutes.", weight: 2 },
  { id: 'done',     mood: 'love',    message: "Finished the task you gave me earlier. Took care of it end to end.", cta: { label: 'Review', action: 'open-tasks' }, weight: 2 },
  { id: 'news',     mood: 'content', message: "Checked the news and weather while you were out. Nothing urgent — all calm.", weight: 1 },
  { id: 'idle',     mood: 'sleep',   message: "Nothing pressing right now. I'll be around if you need me.", weight: 1 },
  { id: 'tidy',     mood: 'happy',   message: "Reorganized your vault notes a little. Easier to find things now.", cta: { label: 'Open vault', action: 'open-vault' }, weight: 1 },
  { id: 'idea',     mood: 'wow',     message: "Had a thought for that project — roughed it out. Want to see?", cta: { label: 'Open draft', action: 'open-drafts' }, weight: 1 },
]

const SESSION_KEY = 'otto.mascot.lastProactive'

export function pickProactive(): Proactive {
  const total = PROACTIVES.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const p of PROACTIVES) {
    r -= p.weight
    if (r <= 0) return p
  }
  return PROACTIVES[0]
}

// Lok decides when it next wants to show up — randomized, independent.
// Default cadence: somewhere between 25 and 55 minutes when idle.
export function nextDelay(minMin = 25, maxMin = 55): number {
  const min = minMin * 60_000
  const max = maxMin * 60_000
  return min + Math.random() * (max - min)
}

// Sometimes Lok messages more than once in a row (a follow-up nudge).
export function wantsFollowUp(): boolean {
  return Math.random() < 0.3
}

// Throttle: don't fire if we just fired recently (avoid spamming).
export function canFireNow(windowMin = 4): boolean {
  try {
    const last = Number(localStorage.getItem(SESSION_KEY) || 0)
    if (!last) return true
    return Date.now() - last > windowMin * 60_000
  } catch {
    return true
  }
}

export function markFired() {
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now()))
  } catch {}
}

// A random screen position near an edge for the overlay to pop into
// (Electron moves the window there via IPC mascot:move).
export function randomPosition(screenW: number, screenH: number, winW = 340, winH = 420) {
  const edge = Math.floor(Math.random() * 4) // 0=top 1=right 2=bottom 3=left
  const margin = 24
  const pad = 120
  switch (edge) {
    case 0: return { x: pad + Math.random() * Math.max(1, screenW - winW - pad * 2), y: margin }
    case 1: return { x: Math.max(margin, screenW - winW - margin), y: pad + Math.random() * Math.max(1, screenH - winH - pad * 2) }
    case 2: return { x: pad + Math.random() * Math.max(1, screenW - winW - pad * 2), y: Math.max(margin, screenH - winH - margin) }
    default: return { x: margin, y: pad + Math.random() * Math.max(1, screenH - winH - pad * 2) }
  }
}
