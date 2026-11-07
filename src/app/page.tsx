'use client'

import { Sidebar } from '@/components/otto/sidebar'
import { Topbar } from '@/components/otto/topbar'
import { Footer } from '@/components/otto/footer'
import { CommandPalette } from '@/components/otto/command-palette'
import { MobileCompanion } from '@/components/otto/mobile-companion'
import { useOtto } from '@/components/otto/store'
import { useEffect, useState } from 'react'
import { ChatView } from '@/components/views/chat-view'
import { DashboardView } from '@/components/views/dashboard-view'
import { AutonomyView } from '@/components/views/autonomy-view'
import { TasksView } from '@/components/views/tasks-view'
import { AgentsView } from '@/components/views/agents-view'
import { BotsView } from '@/components/views/bots-view'
import { VaultView } from '@/components/views/vault-view'
import { CredentialsView } from '@/components/views/credentials-view'
import { ModelsView } from '@/components/views/models-view'
import { RecipesView } from '@/components/views/recipes-view'
import { TimelineView } from '@/components/views/timeline-view'
import { AnalyticsView } from '@/components/views/analytics-view'
import { SettingsView } from '@/components/views/settings-view'

export default function Home() {
  const { view } = useOtto()
  const [isMobile, setIsMobile] = useState(false)
  const [forceDesktop, setForceDesktop] = useState(false)

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Mobile companion shows on phones unless the user navigates to a specific view
  const showCompanion = isMobile && !forceDesktop && view === 'chat'

  useEffect(() => {
    if (isMobile && view !== 'chat') {
      setForceDesktop(true)
    }
    if (view === 'chat') {
      setForceDesktop(false)
    }
  }, [view, isMobile])

  if (showCompanion) {
    return (
      <div className="otto-shell">
        <MobileCompanion />
        <CommandPalette />
      </div>
    )
  }

  // Chat view: full height, no padding wrapper, no footer
  if (view === 'chat') {
    return (
      <div className="otto-shell">
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Topbar />
            <main className="flex-1 overflow-hidden">
              <ChatView />
            </main>
          </div>
        </div>
        <CommandPalette />
      </div>
    )
  }

  return (
    <div className="otto-shell">
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10">
              {view === 'dashboard' && <DashboardView />}
              {view === 'autonomy' && <AutonomyView />}
              {view === 'tasks' && <TasksView />}
              {view === 'agents' && <AgentsView />}
              {view === 'bots' && <BotsView />}
              {view === 'vault' && <VaultView />}
              {view === 'credentials' && <CredentialsView />}
              {view === 'models' && <ModelsView />}
              {view === 'recipes' && <RecipesView />}
              {view === 'timeline' && <TimelineView />}
              {view === 'analytics' && <AnalyticsView />}
              {view === 'settings' && <SettingsView />}
            </div>
          </main>
          <Footer />
        </div>
      </div>
      <CommandPalette />
    </div>
  )
}
