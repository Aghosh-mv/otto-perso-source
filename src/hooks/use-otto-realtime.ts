'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Agent, ActivityLog } from '@/lib/types'

interface RealtimeState {
  connected: boolean
  agents: Agent[] | null
  newActivity: ActivityLog[]
  emergencyActive: boolean | null
  vaultExternalEdit: { filePath: string; title: string; ts: number } | null
  vaultExternalDelete: { filePath: string; id: string; ts: number } | null
}

/**
 * Hook that subscribes to the Otto realtime mini-service.
 * Returns live agent updates, new activity entries, emergency state changes,
 * and vault external edit/delete notifications (from the file watcher).
 * Falls back gracefully — if the socket can't connect, returns nulls and the
 * calling view should poll the REST APIs as before.
 */
export function useOttoRealtime(opts: {
  onActivity?: (a: ActivityLog) => void
  onVaultEdit?: (filePath: string) => void
  onVaultDelete?: (filePath: string) => void
} = {}) {
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    agents: null,
    newActivity: [],
    emergencyActive: null,
    vaultExternalEdit: null,
    vaultExternalDelete: null,
  })
  const socketRef = useRef<Socket | null>(null)
  const onActivityRef = useRef(opts.onActivity)
  const onVaultEditRef = useRef(opts.onVaultEdit)
  const onVaultDeleteRef = useRef(opts.onVaultDelete)
  onActivityRef.current = opts.onActivity
  onVaultEditRef.current = opts.onVaultEdit
  onVaultDeleteRef.current = opts.onVaultDelete

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      timeout: 8000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }))
    })
    socket.on('disconnect', () => {
      setState((s) => ({ ...s, connected: false }))
    })
    socket.on('agents:update', (payload: { agents: Agent[] }) => {
      setState((s) => ({ ...s, agents: payload.agents }))
    })
    socket.on('activity:new', (payload: { entry: ActivityLog }) => {
      setState((s) => ({ ...s, newActivity: [payload.entry, ...s.newActivity].slice(0, 20) }))
      onActivityRef.current?.(payload.entry)
    })
    socket.on('emergency:change', (payload: { active: boolean }) => {
      setState((s) => ({ ...s, emergencyActive: payload.active }))
    })
    socket.on('vault:external-edit', (payload: { filePath: string; title: string }) => {
      setState((s) => ({ ...s, vaultExternalEdit: { ...payload, ts: Date.now() } }))
      onVaultEditRef.current?.(payload.filePath)
    })
    socket.on('vault:external-delete', (payload: { filePath: string; id: string }) => {
      setState((s) => ({ ...s, vaultExternalDelete: { ...payload, ts: Date.now() } }))
      onVaultDeleteRef.current?.(payload.filePath)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  return state
}
