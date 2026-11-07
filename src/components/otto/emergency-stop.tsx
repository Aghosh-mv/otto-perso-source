'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OctagonX, ShieldCheck } from 'lucide-react'
import { useOtto } from './store'
import { useState } from 'react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function EmergencyStopDialog({ open, onOpenChange }: Props) {
  const { emergencyActive, setEmergencyActive } = useOtto()
  const [busy, setBusy] = useState(false)

  async function apply(target: boolean) {
    setBusy(true)
    try {
      const res = await fetch('/api/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: target }),
      })
      if (!res.ok) throw new Error('failed')
      setEmergencyActive(target)
      onOpenChange(false)
      if (target) {
        toast.error('Emergency Stop engaged', {
          description: 'All agents halted. Queued tasks cancelled.',
        })
      } else {
        toast.success('Otto resumed', {
          description: 'Stopped agents set back to idle.',
        })
      }
    } catch {
      toast.error('Could not change emergency state')
    } finally {
      setBusy(false)
    }
  }

  const isHalted = emergencyActive

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2" style={{ borderColor: 'var(--signal)' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <OctagonX size={18} style={{ color: 'var(--signal)' }} />
            {isHalted ? 'Resume Otto?' : 'Emergency Stop'}
          </DialogTitle>
          <DialogDescription>
            {isHalted
              ? 'Otto is currently halted. Resuming will set stopped agents back to idle. Queued tasks remain cancelled — you can re-queue them from Tasks.'
              : 'This immediately halts every agent and cancels all queued and executing tasks. Already-completed actions are NOT reverted (use the Timeline to undo).'}
          </DialogDescription>
        </DialogHeader>

        {!isHalted && (
          <div
            className="text-xs otto-mono p-3 border"
            style={{
              borderColor: 'var(--hair)',
              background: 'var(--paper-soft)',
              color: 'var(--ink-muted)',
            }}
          >
            Hotkey: <kbd className="px-1.5 py-0.5 border border-hair bg-background">Ctrl</kbd> +{' '}
            <kbd className="px-1.5 py-0.5 border border-hair bg-background">Shift</kbd> +{' '}
            <kbd className="px-1.5 py-0.5 border border-hair bg-background">Esc</kbd>
            <br />
            <span className="opacity-70">Also available as a fixed button on the mobile app.</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => apply(!isHalted)}
            disabled={busy}
            className="gap-1.5"
            style={
              !isHalted
                ? { background: 'var(--signal)', color: 'var(--signal-fg)' }
                : { background: 'var(--good)', color: 'white' }
            }
          >
            {isHalted ? <ShieldCheck size={15} /> : <OctagonX size={15} />}
            {isHalted ? 'Resume Otto' : 'Engage Stop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
