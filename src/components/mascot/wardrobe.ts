// Lok — Otto's mascot wardrobe data. All skins, accessories, and moods.
// Every renderer is pure SVG (no images), so it scales crisply and themes freely.

export type Skin = {
  id: string
  name: string
  a: string // gradient inner
  b: string // gradient mid
  c: string // gradient outer
  glow: string
  stars?: boolean
}

export const SKINS: Skin[] = [
  { id: 'aura',   name: 'Aura',      a: '#c4b5fd', b: '#6d28d9', c: '#3b0764', glow: '#b794f4' },
  { id: 'sunset', name: 'Sunset',    a: '#fde68a', b: '#fb7185', c: '#9f1239', glow: '#fbbf24' },
  { id: 'mint',   name: 'Mint',      a: '#a7f3d0', b: '#14b8a6', c: '#0f766e', glow: '#6ee7b7' },
  { id: 'gum',    name: 'Bubblegum', a: '#fbcfe8', b: '#ec4899', c: '#9d174d', glow: '#f9a8d4' },
  { id: 'ocean',  name: 'Ocean',     a: '#bae6fd', b: '#3b82f6', c: '#1e3a8a', glow: '#7dd3fc' },
  { id: 'galaxy', name: 'Galaxy',    a: '#312e81', b: '#6d28d9', c: '#0b1027', glow: '#a78bfa', stars: true },
  { id: 'gold',   name: 'Gold',      a: '#fef3c7', b: '#f59e0b', c: '#92400e', glow: '#fde68a' },
  { id: 'slime',  name: 'Slime',     a: '#d9f99d', b: '#84cc16', c: '#365314', glow: '#bef264' },
  { id: 'ghost',  name: 'Ghost',     a: '#ffffff', b: '#cbd5e1', c: '#94a3b8', glow: '#f1f5f9' },
  { id: 'lava',   name: 'Lava',      a: '#fed7aa', b: '#f97316', c: '#7c2d12', glow: '#fb923c' },
]

// Accessories that render BEHIND the body (lower z-order)
export const BACK_ACCESSORIES = ['cape', 'wings']

export const ACCESSORIES: { id: string; label: string; group: 'hat' | 'eyewear' | 'face' | 'body' }[] = [
  { id: 'top_hat',       label: 'Top hat',      group: 'hat' },
  { id: 'beanie',        label: 'Beanie',       group: 'hat' },
  { id: 'cap',           label: 'Cap',          group: 'hat' },
  { id: 'crown',         label: 'Crown',        group: 'hat' },
  { id: 'wizard_hat',    label: 'Wizard hat',   group: 'hat' },
  { id: 'party_hat',     label: 'Party hat',    group: 'hat' },
  { id: 'sunglasses',    label: 'Sunglasses',   group: 'eyewear' },
  { id: 'round_glasses', label: 'Round glasses',group: 'eyewear' },
  { id: 'monocle',       label: 'Monocle',      group: 'eyewear' },
  { id: 'vr',            label: 'VR headset',   group: 'eyewear' },
  { id: 'bowtie',        label: 'Bowtie',       group: 'face' },
  { id: 'mustache',      label: 'Mustache',     group: 'face' },
  { id: 'headphones',    label: 'Headphones',   group: 'body' },
  { id: 'scarf',         label: 'Scarf',        group: 'body' },
  { id: 'mittens',       label: 'Mittens',      group: 'body' },
  { id: 'wings',         label: 'Wings',        group: 'body' },
  { id: 'cape',          label: 'Cape',         group: 'body' },
]

export const MOODS: { id: string; label: string; emoji: string }[] = [
  { id: 'happy',   label: 'Happy',   emoji: '😊' },
  { id: 'content', label: 'Content', emoji: '😌' },
  { id: 'alert',   label: 'Alert',   emoji: '😮' },
  { id: 'love',    label: 'Love',    emoji: '😍' },
  { id: 'think',   label: 'Think',   emoji: '🤔' },
  { id: 'sleep',   label: 'Sleep',   emoji: '😴' },
  { id: 'wow',     label: 'Wow',     emoji: '🤩' },
  { id: 'wink',    label: 'Wink',    emoji: '😉' },
]

export type MascotConfig = {
  skin: string
  accessories: string[]
  mood: string
}

export const DEFAULT_MASCOT: MascotConfig = {
  skin: 'aura',
  accessories: ['round_glasses', 'bowtie'],
  mood: 'happy',
}
