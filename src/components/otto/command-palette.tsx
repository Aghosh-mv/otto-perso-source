'use client'

import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useOtto, type ViewKey } from './store'
import {
  MessageSquare, LayoutGrid, Gauge, ListTodo, Network, Bot, BookMarked, ChefHat,
  Activity, KeyRound, Cpu, Settings, OctagonX, Plus, Play, Search,
} from 'lucide-react'
import { toast } from 'sonner'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ size?: number }>
  group: 'navigate' | 'action' | 'recipe'
  action: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { setView, setSidebarOpen } = useOtto()
  const [recipes, setRecipes] = useState<{ id: string; title: string }[]>([])

  // Load recipes when palette opens
  useEffect(() => {
    if (!open) return
    fetch('/api/recipes').then((r) => r.json()).then((rs) => {
      setRecipes(rs.map((r: { id: string; title: string }) => ({ id: r.id, title: r.title })))
    })
  }, [open])

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      // Esc to close
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  function nav(view: ViewKey) {
    setView(view)
    setSidebarOpen(false)
    setOpen(false)
  }

  async function runRecipe(id: string, title: string) {
    setOpen(false)
    const res = await fetch(`/api/recipes/${id}/run`, { method: 'POST' })
    if (res.ok) {
      toast.success('Recipe queued', { description: title })
    } else {
      toast.error('Could not run recipe')
    }
  }

  async function emergencyStop() {
    setOpen(false)
    const res = await fetch('/api/emergency-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    })
    if (res.ok) {
      toast.error('Emergency Stop engaged', {
        description: 'All agents halted. Queued tasks cancelled.',
      })
    }
  }

  async function newTask() {
    nav('tasks')
    setTimeout(() => {
      // The Tasks view "New task" button is the first button after the H1
      const btn = document.querySelector('button') as HTMLButtonElement | null
      // Better: dispatch a custom event the Tasks view can listen for
      window.dispatchEvent(new CustomEvent('otto:new-task'))
    }, 100)
  }

  const items: CommandItem[] = [
    // Navigate
    { id: 'n-chat', label: 'Chat', icon: MessageSquare, group: 'navigate', action: () => nav('chat') },
    { id: 'n-dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'navigate', action: () => nav('dashboard') },
    { id: 'n-autonomy', label: 'Autonomy', icon: Gauge, group: 'navigate', action: () => nav('autonomy') },
    { id: 'n-tasks', label: 'Tasks', icon: ListTodo, group: 'navigate', action: () => nav('tasks') },
    { id: 'n-agents', label: 'Agents', icon: Network, group: 'navigate', action: () => nav('agents') },
    { id: 'n-bots', label: 'Custom Bots', icon: Bot, group: 'navigate', action: () => nav('bots') },
    { id: 'n-vault', label: 'Vault', icon: BookMarked, group: 'navigate', action: () => nav('vault') },
    { id: 'n-recipes', label: 'Recipes', icon: ChefHat, group: 'navigate', action: () => nav('recipes') },
    { id: 'n-timeline', label: 'Timeline', icon: Activity, group: 'navigate', action: () => nav('timeline') },
    { id: 'n-credentials', label: 'Credentials', icon: KeyRound, group: 'navigate', action: () => nav('credentials') },
    { id: 'n-models', label: 'Models', icon: Cpu, group: 'navigate', action: () => nav('models') },
    { id: 'n-settings', label: 'Settings', icon: Settings, group: 'navigate', action: () => nav('settings') },
    // Actions
    { id: 'a-new-task', label: 'New task', hint: 'Queue work for Otto', icon: Plus, group: 'action', action: newTask },
    { id: 'a-emergency', label: 'Emergency Stop', hint: 'Halt all agents', icon: OctagonX, group: 'action', action: emergencyStop },
  ]

  if (!open) return null

  const grouped: Record<string, CommandItem[]> = { navigate: [], action: [], recipe: [] }
  for (const item of items) grouped[item.group].push(item)
  for (const r of recipes) {
    grouped.recipe.push({
      id: `r-${r.id}`,
      label: r.title,
      hint: 'Run recipe',
      icon: Play,
      group: 'recipe',
      action: () => runRecipe(r.id, r.title),
    })
  }

  const groupLabel: Record<string, string> = {
    navigate: 'Navigate',
    action: 'Actions',
    recipe: 'Run recipe',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative w-full max-w-xl bg-card border-2 shadow-lg"
        style={{ borderColor: 'var(--ink)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command loop>
          <div className="flex items-center gap-2 px-4 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
            <Search size={14} className="text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent border-0 outline-none py-3 text-sm placeholder:text-muted-foreground"
            />
            <kbd className="text-[10px] otto-mono px-1.5 py-0.5 border border-hair text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            {Object.entries(grouped).map(([group, items]) =>
              items.length === 0 ? null : (
                <Command.Group key={group} heading={groupLabel[group]} className="text-foreground">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.hint ?? ''}`}
                        onSelect={() => item.action()}
                        className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer aria-selected:bg-paper-soft aria-selected:text-foreground"
                        style={{
                          // CSS variable approach for selection
                          ['--tw-bg-opacity' as string]: 1,
                        }}
                      >
                        <Icon size={14} />
                        <span className="flex-1">{item.label}</span>
                        {item.hint && (
                          <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
                            {item.hint}
                          </span>
                        )}
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )
            )}
          </Command.List>
          <div className="px-4 py-2 border-t border-hair flex items-center justify-between text-[10px] otto-mono uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
            <span>↑↓ navigate · ↵ select</span>
            <span>Otto Command</span>
          </div>
        </Command>
      </div>
    </div>
  )
}
