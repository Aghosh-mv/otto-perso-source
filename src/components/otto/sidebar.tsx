'use client'

import { useOtto, type ViewKey } from './store'
import { OttoWordmark, OttoMark } from './mark'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  LayoutGrid,
  Gauge,
  ListTodo,
  Network,
  Bot,
  BookMarked,
  KeyRound,
  Cpu,
  ChefHat,
  Activity,
  BarChart3,
  Settings,
  Sparkles,
  Cloud,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NavItem {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  group: 'main' | 'work' | 'system'
}

const NAV: NavItem[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare, group: 'main' },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, group: 'work' },
  { key: 'autonomy', label: 'Autonomy', icon: Gauge, group: 'work' },
  { key: 'tasks', label: 'Tasks', icon: ListTodo, group: 'work' },
  { key: 'agents', label: 'Agents', icon: Network, group: 'work' },
  { key: 'bots', label: 'Bots', icon: Bot, group: 'work' },
  { key: 'vault', label: 'Vault', icon: BookMarked, group: 'work' },
  { key: 'drive', label: 'Drive', icon: Cloud, group: 'work' },
  { key: 'recipes', label: 'Recipes', icon: ChefHat, group: 'work' },
  { key: 'timeline', label: 'Timeline', icon: Activity, group: 'system' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, group: 'system' },
  { key: 'credentials', label: 'Credentials', icon: KeyRound, group: 'system' },
  { key: 'models', label: 'Models', icon: Cpu, group: 'system' },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'system' },
  { key: 'wardrobe', label: 'Lok', icon: Sparkles, group: 'system' },
]

export function Sidebar() {
  const { view, setView, sidebarOpen, setSidebarOpen } = useOtto()

  const main = NAV.filter((n) => n.group === 'main')
  const work = NAV.filter((n) => n.group === 'work')
  const system = NAV.filter((n) => n.group === 'system')

  const renderItem = (item: NavItem) => {
    const active = view === item.key
    const Icon = item.icon
    return (
      <button
        key={item.key}
        onClick={() => {
          setView(item.key)
          setSidebarOpen(false)
        }}
        className={cn(
          'group relative w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
          'border-l-2',
          active
            ? 'border-signal bg-paper text-foreground font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-paper'
        )}
        style={active ? { borderLeftColor: 'var(--signal)' } : undefined}
      >
        <Icon size={15} className={cn(active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
        <span className="tracking-tight">{item.label}</span>
        {active && (
          <span
            className="ml-auto otto-signal-dot"
            aria-hidden
          />
        )}
      </button>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed md:static z-40 inset-y-0 left-0 w-[244px] shrink-0',
          'bg-sidebar border-r border-hair flex flex-col',
          'transition-transform duration-200 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="h-14 px-5 flex items-center border-b border-hair">
          <OttoWordmark size={18} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-0.5 px-2">{main.map(renderItem)}</div>
          <div className="px-5 mt-6 mb-2 otto-label">Work</div>
          <div className="space-y-0.5 px-2">{work.map(renderItem)}</div>
          <div className="px-5 mt-6 mb-2 otto-label">System</div>
          <div className="space-y-0.5 px-2">{system.map(renderItem)}</div>
        </nav>

        {/* Footer status */}
        <div className="border-t border-hair p-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="otto-signal-dot otto-pulse" />
            <span className="text-xs text-muted-foreground otto-mono">OTTO · v0.4.0</span>
          </div>
          <div className="px-2 mt-1 text-[10px] text-muted-foreground/70 otto-mono leading-relaxed">
            Local-first · 1 main + 3 workers active
          </div>
        </div>
      </aside>
    </>
  )
}
