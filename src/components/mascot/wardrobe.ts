// Lok — Otto's mascot wardrobe data.
// Body presets, skins, eye colors, accessories, moods. All pure SVG.

export type Skin = {
  id: string
  name: string
  a: string // gradient inner
  b: string // gradient mid
  c: string // gradient outer
  glow: string
  stars?: boolean
}

// ─── Body presets (shape archetypes — original names, no brand references) ──
export const PRESETS: { id: string; label: string; blurb: string }[] = [
  { id: 'orb',   label: 'Orb',   blurb: 'Smooth glowing sphere — the classic Lok.' },
  { id: 'bolt',  label: 'Bolt',  blurb: 'Angular little robot with an antenna.' },
  { id: 'dart',  label: 'Dart',  blurb: 'Pointy cursor-shaped buddy that leads the way.' },
  { id: 'wisp',  label: 'Wisp',  blurb: 'Floaty ghost with a wavy bottom.' },
  { id: 'mitts', label: 'Mitts', blurb: 'Round cat with ears and whiskers.' },
]

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
  { id: 'midnight', name: 'Midnight', a: '#1e293b', b: '#0f172a', c: '#020617', glow: '#334155' },
  { id: 'cocoa',  name: 'Cocoa',     a: '#d6b89c', b: '#8b5e3c', c: '#4b2e16', glow: '#c69a6f' },
]

export const EYE_COLORS: { id: string; name: string; color: string }[] = [
  { id: 'ink',    name: 'Ink',    color: '#1a1030' },
  { id: 'sky',    name: 'Sky',    color: '#2563eb' },
  { id: 'mint',   name: 'Mint',   color: '#059669' },
  { id: 'amber',  name: 'Amber',  color: '#d97706' },
  { id: 'ruby',   name: 'Ruby',   color: '#dc2626' },
  { id: 'violet', name: 'Violet', color: '#7c3aed' },
  { id: 'rose',   name: 'Rose',   color: '#db2777' },
  { id: 'cyan',   name: 'Cyan',   color: '#0891b2' },
  { id: 'snow',   name: 'Snow',   color: '#ffffff' },
]

// Accessories that render BEHIND the body (lower z-order)
export const BACK_ACCESSORIES = ['cape', 'wings', 'angel_wings', 'bat_wings', 'jetpack']

export const ACCESSORIES: { id: string; label: string; group: 'hat' | 'eyewear' | 'face' | 'body' | 'spicy' }[] = [
  // hats
  { id: 'top_hat',         label: 'Top hat',        group: 'hat' },
  { id: 'beanie',          label: 'Beanie',         group: 'hat' },
  { id: 'cap',             label: 'Cap',            group: 'hat' },
  { id: 'crown',           label: 'Crown',          group: 'hat' },
  { id: 'wizard_hat',      label: 'Wizard hat',     group: 'hat' },
  { id: 'party_hat',       label: 'Party hat',      group: 'hat' },
  { id: 'cowboy',          label: 'Cowboy hat',     group: 'hat' },
  { id: 'flower_crown',    label: 'Flower crown',   group: 'hat' },
  { id: 'halo',            label: 'Halo',           group: 'hat' },
  { id: 'devil_horns',     label: 'Devil horns',    group: 'hat' },
  { id: 'cat_ears',        label: 'Cat ears',       group: 'hat' },
  { id: 'chef_hat',        label: 'Chef hat',       group: 'hat' },
  { id: 'astronaut',       label: 'Astronaut helmet', group: 'hat' },
  { id: 'pirate',          label: 'Pirate bandana', group: 'hat' },
  // eyewear
  { id: 'sunglasses',      label: 'Sunglasses',     group: 'eyewear' },
  { id: 'round_glasses',   label: 'Round glasses',  group: 'eyewear' },
  { id: 'monocle',         label: 'Monocle',        group: 'eyewear' },
  { id: 'vr',              label: 'VR headset',     group: 'eyewear' },
  { id: 'shutter_shades',  label: 'Shutter shades', group: 'eyewear' },
  { id: 'eye_patch',       label: 'Eye patch',      group: 'eyewear' },
  { id: 'goggles',         label: 'Goggles',        group: 'eyewear' },
  // face
  { id: 'bowtie',          label: 'Bowtie',         group: 'face' },
  { id: 'mustache',        label: 'Mustache',       group: 'face' },
  { id: 'tongue',          label: 'Tongue out',     group: 'face' },
  { id: 'freckles',        label: 'Freckles',       group: 'face' },
  { id: 'mask',            label: 'Hero mask',      group: 'face' },
  { id: 'blush_more',      label: 'Extra blush',    group: 'face' },
  // body / hand / back
  { id: 'headphones',      label: 'Headphones',     group: 'body' },
  { id: 'scarf',           label: 'Scarf',          group: 'body' },
  { id: 'mittens',         label: 'Mittens',        group: 'body' },
  { id: 'tie',             label: 'Necktie',        group: 'body' },
  { id: 'necklace',        label: 'Necklace',       group: 'body' },
  { id: 'backpack',        label: 'Backpack',       group: 'body' },
  { id: 'balloon',         label: 'Balloon',        group: 'body' },
  { id: 'coffee',          label: 'Coffee cup',     group: 'body' },
  { id: 'lightsaber',      label: 'Lightsaber',     group: 'body' },
  { id: 'wand',            label: 'Wand',           group: 'body' },
  { id: 'wings',           label: 'Wings',          group: 'body' },
  { id: 'angel_wings',     label: 'Angel wings',    group: 'body' },
  { id: 'bat_wings',       label: 'Bat wings',      group: 'body' },
  { id: 'cape',            label: 'Cape',           group: 'body' },
  { id: 'jetpack',         label: 'Jetpack',        group: 'body' },
  // spicy — cheeky / suggestive-but-non-explicit gags (opt-in). Lok is a cute orb,
  // so these read as playful cartoon humor, not explicit content.
  { id: 'birthday_suit',   label: 'Birthday suit',  group: 'spicy' },
  { id: 'censor_bar',      label: 'Censor bar',     group: 'spicy' },
  { id: 'heart_pasties',   label: 'Heart pasties',  group: 'spicy' },
  { id: 'fundoshi',        label: 'Fundoshi',       group: 'spicy' },
  { id: 'speedo',          label: 'Speedo',         group: 'spicy' },
  { id: 'sock_garter',     label: 'Sock garter',    group: 'spicy' },
  { id: 'bubble_bath',     label: 'Bubble bath',    group: 'spicy' },
  { id: 'devils_advocate', label: 'Devil\'s advocate', group: 'spicy' },
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
  preset: string
  skin: string
  eyeColor: string
  expressiveness: number // 0..1
  size: number // px height
  accessories: string[]
  mood: string
}

export const DEFAULT_MASCOT: MascotConfig = {
  preset: 'orb',
  skin: 'aura',
  eyeColor: 'ink',
  expressiveness: 0.5,
  size: 300,
  accessories: ['round_glasses', 'bowtie'],
  mood: 'happy',
}
