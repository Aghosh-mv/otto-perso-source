'use client'

import { create } from 'zustand'

export type ViewKey =
  | 'chat'
  | 'dashboard'
  | 'autonomy'
  | 'tasks'
  | 'agents'
  | 'bots'
  | 'vault'
  | 'credentials'
  | 'models'
  | 'recipes'
  | 'timeline'
  | 'analytics'
  | 'settings'
  | 'wardrobe'

interface OttoState {
  view: ViewKey
  setView: (v: ViewKey) => void
  emergencyActive: boolean
  setEmergencyActive: (v: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  currentAutonomyLevel: number
  setCurrentAutonomyLevel: (l: number) => void
}

export const useOtto = create<OttoState>((set) => ({
  view: 'chat',
  setView: (v) => set({ view: v }),
  emergencyActive: false,
  setEmergencyActive: (v) => set({ emergencyActive: v }),
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  currentAutonomyLevel: 2,
  setCurrentAutonomyLevel: (l) => set({ currentAutonomyLevel: l }),
}))
