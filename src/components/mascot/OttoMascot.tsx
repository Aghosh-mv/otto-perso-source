'use client'

import { useMemo } from 'react'
import { SKINS, BACK_ACCESSORIES, type MascotConfig } from './wardrobe'

// Lok — Otto's desktop mascot. Pure SVG, animated via CSS keyframes.
// Appears as a floating, always-on-top companion that emotes to match Otto's state.

type Props = {
  skin: string
  accessories: string[]
  mood: string
  size?: number // px height; default 300
  float?: boolean // gentle bob; default true
}

function heart(cx: number, cy: number, s: number, fill = '#fb7185') {
  return `<path d="M${cx} ${cy + s} C${cx - s * 1.4} ${cy - s * 0.2}, ${cx - s * 0.7} ${cy - s * 1.5}, ${cx} ${cy - s * 0.4} C${cx + s * 0.7} ${cy - s * 1.5}, ${cx + s * 1.4} ${cy - s * 0.2}, ${cx} ${cy + s} Z" fill="${fill}"/>`
}

function defs(skinId: string) {
  const s = SKINS.find((x) => x.id === skinId) || SKINS[0]
  return `<defs>
    <radialGradient id="bodyG" cx="42%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${s.a}"/>
      <stop offset="55%" stop-color="${s.b}"/>
      <stop offset="100%" stop-color="${s.c}"/>
    </radialGradient>
    <radialGradient id="glowG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${s.glow}" stop-opacity=".5"/>
      <stop offset="100%" stop-color="${s.glow}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="softer" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`
}

function stars() {
  return Array.from({ length: 14 })
    .map(() => {
      const x = Math.random() * 240
      const y = 60 + Math.random() * 120
      const r = Math.random() * 1.4 + 0.4
      return `<circle class="lk-spark" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff"/>`
    })
    .join('')
}

function pupil(cx: number, cy: number) {
  return `<circle cx="${cx}" cy="${cy}" r="7" fill="#1a1030"/><circle cx="${cx - 2.5}" cy="${cy - 3}" r="2.6" fill="#fff"/>`
}

function face(mood: string) {
  let eyes = ''
  let mouth = ''
  switch (mood) {
    case 'happy':
      eyes = `<path d="M83 150 Q95 138 107 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>
              <path d="M133 150 Q145 138 157 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M104 184 Q120 198 136 184" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    case 'content':
      eyes = pupil(95, 151) + pupil(145, 151)
      mouth = `<path d="M108 186 Q120 192 132 186" stroke="#1a1030" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      break
    case 'alert':
      eyes = `<circle cx="95" cy="150" r="13" fill="#fff"/><circle cx="145" cy="150" r="13" fill="#fff"/>${pupil(95, 152)}${pupil(145, 152)}`
      mouth = `<ellipse cx="120" cy="190" rx="8" ry="10" fill="#1a1030"/>`
      break
    case 'love':
      eyes = heart(95, 150, 9) + heart(145, 150, 9)
      mouth = `<path d="M104 184 Q120 200 136 184" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    case 'think':
      eyes = pupil(95, 151) + `<path d="M133 148 Q145 142 157 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M108 190 L132 190" stroke="#1a1030" stroke-width="3.5" stroke-linecap="round"/>`
      break
    case 'sleep':
      eyes = `<path d="M85 150 Q95 146 105 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>
              <path d="M135 150 Q145 146 155 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M112 188 Q120 194 128 188" stroke="#1a1030" stroke-width="3" fill="none" stroke-linecap="round"/>`
      break
    case 'wow':
      eyes = `<circle cx="95" cy="150" r="12" fill="#fff"/><circle cx="145" cy="150" r="12" fill="#fff"/>${pupil(95, 151)}${pupil(145, 151)}`
      mouth = `<ellipse cx="120" cy="192" rx="9" ry="11" fill="#1a1030"/>`
      break
    case 'wink':
      eyes = pupil(95, 151) + `<path d="M133 150 Q145 142 157 150" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M104 184 Q120 198 136 184" stroke="#1a1030" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    default:
      eyes = pupil(95, 151) + pupil(145, 151)
      mouth = `<path d="M108 186 Q120 192 132 186" stroke="#1a1030" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
  }
  return `<g class="lk-face">${eyes}${mouth}</g>`
}

function emote(mood: string) {
  const x = 120
  const y = 70
  const wrap = (g: string) => `<g class="lk-emote">${g}</g>`
  switch (mood) {
    case 'love':
      return wrap(
        [60, 95, 130]
          .map((dx, i) =>
            heart(dx, y + 8, 7 + i * 1.6),
          )
          .join(''),
      )
    case 'alert':
      return wrap(
        `<text x="${x}" y="${y}" font-size="30" text-anchor="middle" fill="#fbbf24" font-weight="900" stroke="#1a1030" stroke-width="1">!</text>`,
      )
    case 'think':
      return wrap(`<text x="${x}" y="${y}" font-size="26" text-anchor="middle" fill="#a78bfa" font-weight="900">?</text>`)
    case 'sleep':
      return wrap(
        `<text x="${x - 6}" y="${y}" font-size="18" fill="#cbd5e1" font-weight="700">z</text><text x="${x + 8}" y="${y - 10}" font-size="14" fill="#cbd5e1" font-weight="700">z</text>`,
      )
    case 'wow':
      return wrap(`<text x="${x}" y="${y}" font-size="26" text-anchor="middle" fill="#fbbf24" font-weight="900">★</text>`)
    default:
      return ''
  }
}

function accessory(id: string) {
  switch (id) {
    case 'top_hat':
      return `<g><rect x="92" y="78" width="56" height="42" rx="6" fill="#1a1030"/><rect x="80" y="116" width="80" height="9" rx="4" fill="#1a1030"/><rect x="92" y="104" width="56" height="6" fill="#b794f4"/></g>`
    case 'beanie':
      return `<g><path d="M70 110 Q120 60 170 110 Q170 95 120 80 Q70 95 70 110" fill="#6ee7b7"/><rect x="70" y="104" width="100" height="12" rx="6" fill="#14b8a6"/><circle cx="120" cy="74" r="9" fill="#fff"/></g>`
    case 'cap':
      return `<g><path d="M78 116 Q120 78 162 116 L162 112 Q120 84 78 112 Z" fill="#3b82f6"/><path d="M78 116 Q120 100 162 116 L172 122 Q120 112 68 122 Z" fill="#2563eb"/><circle cx="120" cy="92" r="4" fill="#dbeafe"/></g>`
    case 'crown':
      return `<g><path d="M82 116 L92 84 L104 104 L120 78 L136 104 L148 84 L158 116 Z" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><circle cx="92" cy="84" r="4" fill="#fb7185"/><circle cx="120" cy="78" r="4" fill="#a78bfa"/><circle cx="148" cy="84" r="4" fill="#6ee7b7"/></g>`
    case 'wizard_hat':
      return `<g><path d="M120 36 L86 120 L154 120 Z" fill="#312e81" stroke="#1e1b4b" stroke-width="2"/><path d="M86 120 Q120 110 154 120 L160 126 Q120 116 80 126 Z" fill="#1e1b4b"/><text x="118" y="92" font-size="18" fill="#fbbf24">★</text><circle cx="108" cy="100" r="2" fill="#fbbf24"/><circle cx="130" cy="106" r="1.6" fill="#fbbf24"/></g>`
    case 'party_hat':
      return `<g><path d="M120 50 L96 118 L144 118 Z" fill="#ec4899"/><path d="M120 50 L108 84 L132 84 Z" fill="#a7f3d0"/><path d="M108 84 L96 118 L120 118 Z" fill="#fbbf24"/><path d="M132 84 L144 118 L120 118 Z" fill="#3b82f6"/><circle cx="120" cy="50" r="7" fill="#fbbf24"/></g>`
    case 'sunglasses':
      return `<g><rect x="78" y="142" width="84" height="16" rx="8" fill="#1a1030"/><rect x="76" y="140" width="40" height="20" rx="10" fill="#1a1030"/><rect x="124" y="140" width="40" height="20" rx="10" fill="#1a1030"/><rect x="80" y="143" width="14" height="6" rx="2" fill="#3a3a52" opacity=".7"/></g>`
    case 'round_glasses':
      return `<g><circle cx="95" cy="150" r="15" fill="none" stroke="#1a1030" stroke-width="3"/><circle cx="145" cy="150" r="15" fill="none" stroke="#1a1030" stroke-width="3"/><line x1="110" y1="150" x2="130" y2="150" stroke="#1a1030" stroke-width="3"/></g>`
    case 'monocle':
      return `<g><circle cx="145" cy="150" r="16" fill="none" stroke="#d97706" stroke-width="3"/><line x1="145" y1="166" x2="150" y2="210" stroke="#d97706" stroke-width="1.5"/></g>`
    case 'vr':
      return `<g><rect x="74" y="138" width="92" height="24" rx="8" fill="#1a1030"/><rect x="80" y="142" width="34" height="16" rx="4" fill="#6d28d9"/><rect x="126" y="142" width="34" height="16" rx="4" fill="#6d28d9"/><circle cx="97" cy="150" r="3" fill="#a7f3d0"/><circle cx="143" cy="150" r="3" fill="#a7f3d0"/></g>`
    case 'bowtie':
      return `<g><path d="M104 206 L120 214 L104 222 Z" fill="#fb7185"/><path d="M136 206 L120 214 L136 222 Z" fill="#fb7185"/><circle cx="120" cy="214" r="4" fill="#9d174d"/></g>`
    case 'mustache':
      return `<g><path d="M100 178 Q110 172 120 178 Q130 172 140 178 Q132 184 120 180 Q108 184 100 178 Z" fill="#1a1030"/></g>`
    case 'headphones':
      return `<g><path d="M62 150 Q62 96 120 96 Q178 96 178 150" fill="none" stroke="#1a1030" stroke-width="6" stroke-linecap="round"/><rect x="52" y="146" width="18" height="26" rx="8" fill="#1a1030"/><rect x="170" y="146" width="18" height="26" rx="8" fill="#1a1030"/><rect x="56" y="150" width="10" height="18" rx="4" fill="#b794f4"/></g>`
    case 'scarf':
      return `<g><path d="M64 214 Q120 200 176 214 L176 226 Q120 212 64 226 Z" fill="#fb7185"/><path d="M150 220 L168 250 L156 252 L142 224 Z" fill="#ec4899"/></g>`
    case 'mittens':
      return `<g><ellipse cx="56" cy="210" rx="14" ry="18" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><ellipse cx="184" cy="210" rx="14" ry="18" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><rect x="50" y="196" width="12" height="8" rx="3" fill="#d97706"/><rect x="178" y="196" width="12" height="8" rx="3" fill="#d97706"/></g>`
    case 'wings':
      return `<g><path d="M60 150 Q20 130 24 170 Q30 190 70 180 Z" fill="#a7f3d0" opacity=".85" stroke="#14b8a6" stroke-width="2"/><path d="M180 150 Q220 130 216 170 Q210 190 170 180 Z" fill="#a7f3d0" opacity=".85" stroke="#14b8a6" stroke-width="2"/></g>`
    case 'cape':
      return `<g><path d="M58 130 Q40 230 70 250 L170 250 Q200 230 182 130 Q150 160 120 160 Q90 160 58 130 Z" fill="#dc2626" opacity=".9"/><path d="M58 130 Q150 170 182 130" fill="none" stroke="#7f1d1d" stroke-width="2"/></g>`
    default:
      return ''
  }
}

export function OttoMascot({ skin, accessories, mood, size = 300, float = true }: Props) {
  const svg = useMemo(() => {
    const s = SKINS.find((x) => x.id === skin) || SKINS[0]
    const back = accessories.filter((a) => BACK_ACCESSORIES.includes(a)).map(accessory).join('')
    const front = accessories.filter((a) => !BACK_ACCESSORIES.includes(a)).map(accessory).join('')
    const body = `
      <ellipse class="lk-shadow" cx="120" cy="252" rx="58" ry="11" fill="#000" filter="url(#softer)"/>
      <ellipse cx="120" cy="150" rx="78" ry="72" fill="url(#glowG)"/>
      ${back}
      <g class="lk-body">
        <ellipse cx="120" cy="170" rx="74" ry="80" fill="url(#bodyG)"/>
        ${s.stars ? stars() : ''}
        <ellipse cx="92" cy="138" rx="26" ry="20" fill="#fff" opacity=".22" filter="url(#soft)"/>
        <ellipse cx="98" cy="128" rx="10" ry="7" fill="#fff" opacity=".4"/>
        ${face(mood)}
        <ellipse cx="74" cy="180" rx="11" ry="6" fill="#fb7185" opacity=".45"/>
        <ellipse cx="166" cy="180" rx="11" ry="6" fill="#fb7185" opacity=".45"/>
      </g>
      ${front}
      ${emote(mood)}`
    return `<svg class="lk-mascot" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg">${defs(skin)}${body}</svg>`
  }, [skin, accessories.join(','), mood])

  return (
    <div className={`lk-wrap${float ? ' lk-float' : ''}`} style={{ height: size }}>
      <style>{`
        .lk-wrap{position:relative;width:auto;aspect-ratio:240/300}
        .lk-float{animation:lkFloat 4.2s ease-in-out infinite alternate}
        .lk-mascot{width:100%;height:100%;display:block;overflow:visible}
        .lk-body{transform-origin:120px 175px;animation:lkWobble 3.4s ease-in-out infinite alternate}
        .lk-shadow{transform-origin:120px 250px;animation:lkShadow 3.4s ease-in-out infinite alternate}
        .lk-emote{animation:lkEmote 1.8s ease-in-out infinite alternate}
        .lk-spark{animation:lkTwinkle 1.6s infinite}
        @keyframes lkFloat{from{transform:translateY(0)}to{transform:translateY(-10px)}}
        @keyframes lkWobble{from{transform:scale(1,1) rotate(-1deg)}to{transform:scale(1.025,.975) rotate(1deg)}}
        @keyframes lkShadow{from{transform:scaleX(1);opacity:.18}to{transform:scaleX(.85);opacity:.12}}
        @keyframes lkEmote{from{transform:translateY(0)}to{transform:translateY(-6px)}}
        @keyframes lkTwinkle{0%,100%{opacity:.3}50%{opacity:1}}
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}

export type { MascotConfig }
