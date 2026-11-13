'use client'

import { useMemo } from 'react'
import { SKINS, BACK_ACCESSORIES } from './wardrobe'

// Lok — Otto's mascot. High-fidelity pure-SVG rendering: specular gloss,
// soft contact shadow, bloom aura, rim light, smooth bezier shapes.
// 5 body presets (Orb / Bolt / Dart / Wisp / Mitts), eye color, expressiveness,
// 40+ accessories incl. a cheeky opt-in Spicy pack (suggestive-but-non-explicit).

type Props = {
  preset: string
  skin: string
  eyeColor: string
  expressiveness: number // 0..1
  accessories: string[]
  mood: string
  size?: number
  float?: boolean
}

function heart(cx: number, cy: number, s: number, fill = '#fb7185') {
  return `<path d="M${cx} ${cy + s} C${cx - s * 1.4} ${cy - s * 0.2}, ${cx - s * 0.7} ${cy - s * 1.5}, ${cx} ${cy - s * 0.4} C${cx + s * 0.7} ${cy - s * 1.5}, ${cx + s * 1.4} ${cy - s * 0.2}, ${cx} ${cy + s} Z" fill="${fill}"/>`
}

function defs(skinId: string) {
  const s = SKINS.find((x) => x.id === skinId) || SKINS[0]
  return `<defs>
    <radialGradient id="bodyG" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${s.a}"/>
      <stop offset="50%" stop-color="${s.b}"/>
      <stop offset="100%" stop-color="${s.c}"/>
    </radialGradient>
    <radialGradient id="glowG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${s.glow}" stop-opacity=".55"/>
      <stop offset="100%" stop-color="${s.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rimG" cx="50%" cy="82%" r="55%">
      <stop offset="0%" stop-color="${s.a}" stop-opacity=".7"/>
      <stop offset="100%" stop-color="${s.a}" stop-opacity="0"/>
    </radialGradient>
    <filter id="gloss" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b"/>
      <feSpecularLighting in="b" surfaceScale="7" specularConstant="0.95" specularExponent="26" lighting-color="#ffffff" result="spec">
        <fePointLight x="78" y="96" z="60"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specM"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="specM"/></feMerge>
    </filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="softer" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12"/></filter>
  </defs>`
}

function stars() {
  return Array.from({ length: 16 })
    .map(() => {
      const x = 50 + Math.random() * 140
      const y = 110 + Math.random() * 130
      const r = Math.random() * 1.5 + 0.4
      return `<circle class="lk-spark" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff"/>`
    })
    .join('')
}

// ─── Body shape per preset (smooth beziers, gradient + specular gloss) ───────
function bodyShape(preset: string, skinStars?: boolean) {
  const g = 'fill="url(#bodyG)" filter="url(#gloss)"'
  const rim = '<ellipse cx="120" cy="210" rx="68" ry="34" fill="url(#rimG)" opacity=".55"/>'
  const catchlight =
    '<ellipse cx="93" cy="132" rx="24" ry="17" fill="#fff" opacity=".28" filter="url(#soft)"/>' +
    '<ellipse cx="99" cy="124" r="7" fill="#fff" opacity=".55"/>'
  const starsSvg = skinStars ? stars() : ''
  switch (preset) {
    case 'bolt':
      return `
        <rect x="56" y="116" width="128" height="110" rx="26" ry="26" ${g}/>
        ${rim}
        <line x1="120" y1="116" x2="120" y2="92" stroke="#1a1030" stroke-width="4" stroke-linecap="round"/>
        <circle cx="120" cy="88" r="6" fill="#fbbf24" filter="url(#soft)"/>
        <circle cx="60" cy="150" r="4.5" fill="#1a1030"/><circle cx="180" cy="150" r="4.5" fill="#1a1030"/>
        <rect x="72" y="136" width="96" height="58" rx="14" fill="#0b1027" opacity=".5"/>
        ${starsSvg}`
    case 'dart': {
      const dartCatch = '<ellipse cx="136" cy="92" rx="14" ry="10" fill="#fff" opacity=".32" filter="url(#soft)"/><ellipse cx="141" cy="87" r="5" fill="#fff" opacity=".55"/>'
      return `
        <path d="M114 56 L114 206 L137 182 L157 234 L175 226 L155 176 L191 171 Z" ${g} stroke="#1a1030" stroke-width="2.5" stroke-linejoin="round"/>
        ${dartCatch}${rim}`
    }
    case 'wisp':
      return `
        <path d="M60 166 a60 60 0 1 1 120 0 L180 234 Q168 252 156 235 Q144 252 132 235 Q120 252 108 235 Q96 252 84 235 Q72 252 60 235 Z" ${g}/>
        ${catchlight}${rim}
        <path d="M58 168 q-14 6 -6 26" stroke="${'#1a1030'}" stroke-width="3" fill="none" opacity=".0"/>
        ${starsSvg}`
    case 'mitts':
      return `
        <path d="M74 126 L88 98 L102 128 Z" ${g}/>
        <path d="M138 128 L152 98 L166 126 Z" ${g}/>
        <path d="M80 122 L88 106 L96 122 Z" fill="#fb7185" opacity=".55"/>
        <path d="M144 122 L152 106 L160 122 Z" fill="#fb7185" opacity=".55"/>
        <ellipse cx="120" cy="178" rx="70" ry="72" ${g}/>
        ${catchlight}${rim}
        <path d="M84 178 q14 -4 26 0" stroke="#1a1030" stroke-width="1.5" fill="none" opacity=".4"/>
        <path d="M156 178 q-14 -4 -26 0" stroke="#1a1030" stroke-width="1.5" fill="none" opacity=".4"/>
        ${starsSvg}`
    case 'orb':
    default:
      return `
        <ellipse cx="120" cy="172" rx="74" ry="80" ${g}/>
        ${catchlight}${rim}
        ${starsSvg}`
  }
}

function pupil(cx: number, cy: number, eye: string) {
  return `<circle cx="${cx}" cy="${cy}" r="7" fill="${eye}"/><circle cx="${cx - 2.5}" cy="${cy - 3}" r="2.7" fill="#fff"/>`
}

// ─── Face (eyes + mouth) per mood + preset, with eye color + expressiveness ──
function face(mood: string, preset: string, eye: string, ex: number) {
  const scale = 0.85 + 0.3 * ex
  const sc = (n: number) => n * scale
  const eyeStroke = '#1a1030'

  if (preset === 'bolt') {
    // bar eyes on the screen; height varies by mood
    const tall = { alert: 18, wow: 16, happy: 10, content: 8, love: 12, think: 6, sleep: 2, wink: 4 }[mood] ?? 8
    const bars = `
      <rect x="86" y="${154 - tall / 2}" width="22" height="${tall}" rx="4" fill="${eye}" filter="url(#soft)"/>
      <rect x="132" y="${154 - tall / 2}" width="22" height="${tall}" rx="4" fill="${eye}" filter="url(#soft)"/>`
    const mouth = `<g fill="${eye}"><circle cx="108" cy="180" r="2"/><circle cx="120" cy="182" r="2"/><circle cx="132" cy="180" r="2"/><circle cx="100" cy="178" r="1.6"/><circle cx="140" cy="178" r="1.6"/></g>`
    return `<g class="lk-face">${bars}${mouth}</g>`
  }

  if (preset === 'mitts') {
    // almond eyes with vertical slit pupils
    const slit = (cx: number, cy: number) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${sc(11)}" ry="${sc(13)}" fill="#fff"/>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${sc(3.4)}" ry="${sc(8)}" fill="${eye}"/>` +
      `<circle cx="${cx - 1.5}" cy="${cy - 4}" r="2" fill="#fff"/>`
    let eyes = slit(95, 150) + slit(145, 150)
    let mouth = `<path d="M110 184 Q120 190 130 184" stroke="${eyeStroke}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    if (mood === 'sleep') eyes = lines(95) + lines(145), mouth = `<path d="M112 186 q8 6 16 0" stroke="${eyeStroke}" stroke-width="3" fill="none"/>`
    if (mood === 'love') eyes = heart(95, 150, sc(9)) + heart(145, 150, sc(9)), mouth = `<path d="M106 184 Q120 200 134 184" stroke="${eyeStroke}" stroke-width="4" fill="none"/>`
    return `<g class="lk-face">${eyes}${mouth}</g>`
  }

  // orb / dart / wisp — round eyes
  function lines(cx: number) {
    return `<path d="M${cx - 11} 150 Q${cx} 146 ${cx + 11} 150" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
  }
  let eyes = ''
  let mouth = ''
  switch (mood) {
    case 'happy':
      eyes = `<path d="M83 150 Q95 138 107 150" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M133 150 Q145 138 157 150" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M104 184 Q120 198 136 184" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    case 'content':
      eyes = pupil(95, 151, eye) + pupil(145, 151, eye)
      mouth = `<path d="M108 186 Q120 192 132 186" stroke="${eyeStroke}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      break
    case 'alert':
      eyes = `<circle cx="95" cy="150" r="13" fill="#fff"/><circle cx="145" cy="150" r="13" fill="#fff"/>${pupil(95, 152, eye)}${pupil(145, 152, eye)}`
      mouth = `<ellipse cx="120" cy="190" rx="${sc(8)}" ry="${sc(10)}" fill="${eyeStroke}"/>`
      break
    case 'love':
      eyes = heart(95, 150, sc(9)) + heart(145, 150, sc(9))
      mouth = `<path d="M104 184 Q120 200 136 184" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    case 'think':
      eyes = pupil(95, 151, eye) + `<path d="M133 148 Q145 142 157 150" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M108 190 L132 190" stroke="${eyeStroke}" stroke-width="3.5" stroke-linecap="round"/>`
      break
    case 'sleep':
      eyes = lines(95) + lines(145)
      mouth = `<path d="M112 188 Q120 194 128 188" stroke="${eyeStroke}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      break
    case 'wow':
      eyes = `<circle cx="95" cy="150" r="12" fill="#fff"/><circle cx="145" cy="150" r="12" fill="#fff"/>${pupil(95, 151, eye)}${pupil(145, 151, eye)}`
      mouth = `<ellipse cx="120" cy="192" rx="${sc(9)}" ry="${sc(11)}" fill="${eyeStroke}"/>`
      break
    case 'wink':
      eyes = pupil(95, 151, eye) + `<path d="M133 150 Q145 142 157 150" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      mouth = `<path d="M104 184 Q120 198 136 184" stroke="${eyeStroke}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    default:
      eyes = pupil(95, 151, eye) + pupil(145, 151, eye)
      mouth = `<path d="M108 186 Q120 192 132 186" stroke="${eyeStroke}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
  }
  return `<g class="lk-face" style="transform:scale(${scale.toFixed(3)});transform-origin:120px 150px">${eyes}${mouth}</g>`
}

function emote(mood: string) {
  const x = 120
  const y = 70
  const wrap = (g: string) => `<g class="lk-emote">${g}</g>`
  switch (mood) {
    case 'love':
      return wrap([60, 95, 130].map((dx, i) => heart(dx, y + 8, 7 + i * 1.6)).join(''))
    case 'alert':
      return wrap(`<text x="${x}" y="${y}" font-size="30" text-anchor="middle" fill="#fbbf24" font-weight="900" stroke="#1a1030" stroke-width="1">!</text>`)
    case 'think':
      return wrap(`<text x="${x}" y="${y}" font-size="26" text-anchor="middle" fill="#a78bfa" font-weight="900">?</text>`)
    case 'sleep':
      return wrap(`<text x="${x - 6}" y="${y}" font-size="18" fill="#cbd5e1" font-weight="700">z</text><text x="${x + 8}" y="${y - 10}" font-size="14" fill="#cbd5e1" font-weight="700">z</text>`)
    case 'wow':
      return wrap(`<text x="${x}" y="${y}" font-size="26" text-anchor="middle" fill="#fbbf24" font-weight="900">★</text>`)
    default:
      return ''
  }
}

// ─── Accessories (front unless in BACK_ACCESSORIES) ─────────────────────────
function accessory(id: string) {
  switch (id) {
    // hats
    case 'top_hat': return `<g><rect x="92" y="78" width="56" height="42" rx="6" fill="#1a1030"/><rect x="80" y="116" width="80" height="9" rx="4" fill="#1a1030"/><rect x="92" y="104" width="56" height="6" fill="#b794f4"/></g>`
    case 'beanie': return `<g><path d="M70 110 Q120 60 170 110 Q170 95 120 80 Q70 95 70 110" fill="#6ee7b7"/><rect x="70" y="104" width="100" height="12" rx="6" fill="#14b8a6"/><circle cx="120" cy="74" r="9" fill="#fff"/></g>`
    case 'cap': return `<g><path d="M78 116 Q120 78 162 116 L162 112 Q120 84 78 112 Z" fill="#3b82f6"/><path d="M78 116 Q120 100 162 116 L172 122 Q120 112 68 122 Z" fill="#2563eb"/></g>`
    case 'crown': return `<g><path d="M82 116 L92 84 L104 104 L120 78 L136 104 L148 84 L158 116 Z" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><circle cx="92" cy="84" r="4" fill="#fb7185"/><circle cx="120" cy="78" r="4" fill="#a78bfa"/><circle cx="148" cy="84" r="4" fill="#6ee7b7"/></g>`
    case 'wizard_hat': return `<g><path d="M120 36 L86 120 L154 120 Z" fill="#312e81" stroke="#1e1b4b" stroke-width="2"/><path d="M86 120 Q120 110 154 120 L160 126 Q120 116 80 126 Z" fill="#1e1b4b"/><text x="118" y="92" font-size="18" fill="#fbbf24">★</text></g>`
    case 'party_hat': return `<g><path d="M120 50 L96 118 L144 118 Z" fill="#ec4899"/><path d="M120 50 L108 84 L132 84 Z" fill="#a7f3d0"/><path d="M108 84 L96 118 L120 118 Z" fill="#fbbf24"/><circle cx="120" cy="50" r="7" fill="#fbbf24"/></g>`
    case 'cowboy': return `<g><path d="M62 116 Q120 120 178 116 L182 122 Q120 126 58 122 Z" fill="#8b5e3c"/><ellipse cx="120" cy="112" rx="40" ry="16" fill="#a06a3f"/><path d="M88 110 q32 -8 64 0" stroke="#6b4423" stroke-width="2" fill="none"/></g>`
    case 'flower_crown': return `<g><path d="M78 116 Q120 92 162 116" stroke="#14b8a6" stroke-width="3" fill="none"/>${[84, 108, 132, 156].map((x, i) => `<circle cx="${x}" cy="${108 - (i === 1 || i === 2 ? 6 : 0)}" r="6" fill="${['#fb7185', '#fbbf24', '#a78bfa', '#6ee7b7'][i]}"/><circle cx="${x}" cy="${108 - (i === 1 || i === 2 ? 6 : 0)}" r="2.5" fill="#fde68a"/>`).join('')}</g>`
    case 'halo': return `<g><ellipse cx="120" cy="96" rx="34" ry="9" fill="none" stroke="#fde68a" stroke-width="4" filter="url(#soft)"/><ellipse cx="120" cy="96" rx="34" ry="9" fill="none" stroke="#fff" stroke-width="1.5"/></g>`
    case 'devil_horns': return `<g><path d="M86 110 Q80 86 96 96 Z" fill="#dc2626"/><path d="M154 110 Q160 86 144 96 Z" fill="#dc2626"/></g>`
    case 'cat_ears': return `<g><path d="M74 116 L86 92 L100 118 Z" fill="#fbcfe8" stroke="#ec4899" stroke-width="2"/><path d="M140 118 L154 92 L166 116 Z" fill="#fbcfe8" stroke="#ec4899" stroke-width="2"/></g>`
    case 'chef_hat': return `<g><rect x="88" y="104" width="64" height="16" rx="4" fill="#fff"/><ellipse cx="100" cy="96" rx="16" ry="14" fill="#fff"/><ellipse cx="120" cy="90" rx="18" ry="16" fill="#fff"/><ellipse cx="140" cy="96" rx="16" ry="14" fill="#fff"/></g>`
    case 'astronaut': return `<g><ellipse cx="120" cy="108" rx="46" ry="40" fill="#e2e8f0" opacity=".9" stroke="#94a3b8" stroke-width="2"/><ellipse cx="120" cy="108" rx="30" ry="28" fill="#0b1027" opacity=".75"/><ellipse cx="108" cy="98" rx="8" ry="6" fill="#fff" opacity=".3"/><rect x="74" y="104" width="10" height="8" rx="2" fill="#dc2626"/></g>`
    case 'pirate': return `<g><path d="M62 116 Q120 86 178 116 L178 124 Q120 100 62 124 Z" fill="#1a1030"/><circle cx="120" cy="104" r="9" fill="#fff"/><circle cx="120" cy="104" r="4" fill="#1a1030"/></g>`
    // eyewear
    case 'sunglasses': return `<g><rect x="78" y="142" width="84" height="16" rx="8" fill="#1a1030"/><rect x="76" y="140" width="40" height="20" rx="10" fill="#1a1030"/><rect x="124" y="140" width="40" height="20" rx="10" fill="#1a1030"/><rect x="80" y="143" width="14" height="6" rx="2" fill="#3a3a52" opacity=".7"/></g>`
    case 'round_glasses': return `<g><circle cx="95" cy="150" r="15" fill="none" stroke="#1a1030" stroke-width="3"/><circle cx="145" cy="150" r="15" fill="none" stroke="#1a1030" stroke-width="3"/><line x1="110" y1="150" x2="130" y2="150" stroke="#1a1030" stroke-width="3"/></g>`
    case 'monocle': return `<g><circle cx="145" cy="150" r="16" fill="none" stroke="#d97706" stroke-width="3"/><line x1="145" y1="166" x2="150" y2="210" stroke="#d97706" stroke-width="1.5"/></g>`
    case 'vr': return `<g><rect x="74" y="138" width="92" height="24" rx="8" fill="#1a1030"/><rect x="80" y="142" width="34" height="16" rx="4" fill="#6d28d9"/><rect x="126" y="142" width="34" height="16" rx="4" fill="#6d28d9"/></g>`
    case 'shutter_shades': return `<g><rect x="76" y="138" width="88" height="24" rx="6" fill="none" stroke="#1a1030" stroke-width="3"/>${[80, 88, 96, 104, 112, 120, 128, 136, 144, 152].map((x) => `<line x1="${x}" y1="138" x2="${x}" y2="162" stroke="#1a1030" stroke-width="2.5"/>`).join('')}<line x1="76" y1="150" x2="164" y2="150" stroke="#1a1030" stroke-width="2.5"/></g>`
    case 'eye_patch': return `<g><ellipse cx="95" cy="150" rx="16" ry="14" fill="#1a1030"/><path d="M79 150 L60 120" stroke="#1a1030" stroke-width="2"/><path d="M111 150 L130 120" stroke="#1a1030" stroke-width="2"/></g>`
    case 'goggles': return `<g><circle cx="95" cy="150" r="17" fill="none" stroke="#3b82f6" stroke-width="4"/><circle cx="145" cy="150" r="17" fill="none" stroke="#3b82f6" stroke-width="4"/><rect x="108" y="146" width="24" height="8" rx="3" fill="#3b82f6"/></g>`
    // face
    case 'bowtie': return `<g><path d="M104 206 L120 214 L104 222 Z" fill="#fb7185"/><path d="M136 206 L120 214 L136 222 Z" fill="#fb7185"/><circle cx="120" cy="214" r="4" fill="#9d174d"/></g>`
    case 'mustache': return `<g><path d="M100 178 Q110 172 120 178 Q130 172 140 178 Q132 184 120 180 Q108 184 100 178 Z" fill="#1a1030"/></g>`
    case 'tongue': return `<g><path d="M112 188 Q120 208 128 188 Z" fill="#fb7185"/><line x1="120" y1="188" x2="120" y2="200" stroke="#dc2626" stroke-width="1.5"/></g>`
    case 'freckles': return `<g fill="#c69a6f" opacity=".7"><circle cx="84" cy="162" r="1.5"/><circle cx="92" cy="166" r="1.5"/><circle cx="100" cy="162" r="1.5"/><circle cx="140" cy="162" r="1.5"/><circle cx="148" cy="166" r="1.5"/><circle cx="156" cy="162" r="1.5"/></g>`
    case 'mask': return `<g><path d="M74 142 Q120 130 166 142 L160 156 Q120 148 80 156 Z" fill="#1a1030" opacity=".85"/></g>`
    case 'blush_more': return `<g><ellipse cx="74" cy="182" rx="14" ry="8" fill="#fb7185" opacity=".55"/><ellipse cx="166" cy="182" rx="14" ry="8" fill="#fb7185" opacity=".55"/></g>`
    // body / hand / back
    case 'headphones': return `<g><path d="M62 150 Q62 96 120 96 Q178 96 178 150" fill="none" stroke="#1a1030" stroke-width="6" stroke-linecap="round"/><rect x="52" y="146" width="18" height="26" rx="8" fill="#1a1030"/><rect x="170" y="146" width="18" height="26" rx="8" fill="#1a1030"/></g>`
    case 'scarf': return `<g><path d="M64 214 Q120 200 176 214 L176 226 Q120 212 64 226 Z" fill="#fb7185"/><path d="M150 220 L168 250 L156 252 L142 224 Z" fill="#ec4899"/></g>`
    case 'mittens': return `<g><ellipse cx="56" cy="210" rx="14" ry="18" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><ellipse cx="184" cy="210" rx="14" ry="18" fill="#fbbf24" stroke="#d97706" stroke-width="2"/></g>`
    case 'tie': return `<g><path d="M116 200 L124 200 L128 214 L120 230 L112 214 Z" fill="#3b82f6"/><path d="M112 200 L128 200 L124 206 L116 206 Z" fill="#1d4ed8"/></g>`
    case 'necklace': return `<g><path d="M84 206 Q120 218 156 206" stroke="#fde68a" stroke-width="3" fill="none"/><circle cx="120" cy="216" r="5" fill="#fbbf24" filter="url(#soft)"/></g>`
    case 'backpack': return `<g><rect x="172" y="170" width="26" height="40" rx="8" fill="#dc2626"/><rect x="176" y="176" width="18" height="10" rx="3" fill="#7f1d1d"/><path d="M172 178 q-10 8 0 22" stroke="#dc2626" stroke-width="4" fill="none"/></g>`
    case 'balloon': return `<g><line x1="190" y1="210" x2="200" y2="120" stroke="#1a1030" stroke-width="1.5"/><ellipse cx="202" cy="110" rx="14" ry="17" fill="#fb7185" filter="url(#soft)"/><ellipse cx="198" cy="104" r="4" fill="#fff" opacity=".5"/></g>`
    case 'coffee': return `<g><rect x="44" y="196" width="22" height="26" rx="3" fill="#1a1030"/><path d="M66 200 q8 2 8 8 q0 6 -8 6" fill="none" stroke="#1a1030" stroke-width="2"/><rect x="46" y="198" width="18" height="4" fill="#fbbf24"/></g>`
    case 'lightsaber': return `<g><line x1="40" y1="250" x2="120" y2="120" stroke="#fff" stroke-width="6" stroke-linecap="round"/><line x1="40" y1="250" x2="120" y2="120" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" opacity=".6"/><rect x="34" y="248" width="14" height="8" rx="2" fill="#1a1030"/></g>`
    case 'wand': return `<g><line x1="44" y1="246" x2="100" y2="150" stroke="#9d174d" stroke-width="3" stroke-linecap="round"/><path d="M100 150 l5 -10 l-4 8 l6 2 Z" fill="#fbbf24"/><circle cx="100" cy="148" r="4" fill="#fde68a" filter="url(#soft)"/></g>`
    case 'wings': return `<g><path d="M60 150 Q20 130 24 170 Q30 190 70 180 Z" fill="#a7f3d0" opacity=".85" stroke="#14b8a6" stroke-width="2"/><path d="M180 150 Q220 130 216 170 Q210 190 170 180 Z" fill="#a7f3d0" opacity=".85" stroke="#14b8a6" stroke-width="2"/></g>`
    case 'angel_wings': return `<g><path d="M60 160 Q24 140 28 175 Q34 192 70 184 Q50 175 60 160 Z" fill="#fff" opacity=".9" stroke="#e2e8f0" stroke-width="1.5"/><path d="M180 160 Q216 140 212 175 Q206 192 170 184 Q190 175 180 160 Z" fill="#fff" opacity=".9" stroke="#e2e8f0" stroke-width="1.5"/></g>`
    case 'bat_wings': return `<g><path d="M60 150 L20 135 L30 165 L18 175 L40 178 L48 170 L60 175 Z" fill="#1a1030"/><path d="M180 150 L220 135 L210 165 L222 175 L200 178 L192 170 L180 175 Z" fill="#1a1030"/></g>`
    case 'cape': return `<g><path d="M58 130 Q40 230 70 250 L170 250 Q200 230 182 130 Q150 160 120 160 Q90 160 58 130 Z" fill="#dc2626" opacity=".9"/><path d="M58 130 Q150 170 182 130" fill="none" stroke="#7f1d1d" stroke-width="2"/></g>`
    case 'jetpack': return `<g><rect x="166" y="150" width="22" height="46" rx="9" fill="#6b7280"/><circle cx="177" cy="156" r="4" fill="#fbbf24"/><path d="M168 196 q-2 14 4 22 q4 -10 2 -22 Z" fill="#fb923c"/><path d="M186 196 q2 14 -4 22 q-4 -10 -2 -22 Z" fill="#fb923c"/></g>`
    // spicy — cheeky / non-explicit gags
    case 'birthday_suit': return `<g><text x="120" y="240" font-size="9" text-anchor="middle" fill="#fff" opacity=".7" font-weight="700">BIRTHDAY SUIT</text>${[100, 120, 140].map((x, i) => `<circle cx="${x}" cy="${60 + i * 6}" r="2.5" fill="${['#fbbf24', '#fb7185', '#a78bfa'][i]}"/>`).join('')}</g>`
    case 'censor_bar': return `<g><rect x="68" y="204" width="104" height="28" rx="4" fill="#0b1027"/><text x="120" y="222" font-size="11" text-anchor="middle" fill="#fff" font-weight="800">CENSORED</text></g>`
    case 'heart_pasties': return `${heart(100, 168, 8)}${heart(140, 168, 8)}`
    case 'fundoshi': return `<g><path d="M100 214 L140 214 L148 232 Q120 244 92 232 Z" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/><path d="M114 214 L126 214 L126 230 L114 230 Z" fill="#e2e8f0"/></g>`
    case 'speedo': return `<g><path d="M96 212 Q120 206 144 212 L142 230 Q120 236 98 230 Z" fill="#1d4ed8"/><line x1="120" y1="212" x2="120" y2="230" stroke="#1e3a8a" stroke-width="1.5"/></g>`
    case 'sock_garter': return `<g><rect x="92" y="232" width="56" height="8" rx="3" fill="#1a1030"/><circle cx="120" cy="236" r="4" fill="#fb7185"/><line x1="100" y1="240" x2="96" y2="252" stroke="#fb7185" stroke-width="1.5"/><line x1="140" y1="240" x2="144" y2="252" stroke="#fb7185" stroke-width="1.5"/></g>`
    case 'bubble_bath': return `<g>${[80, 100, 120, 140, 160, 90, 130, 150].map((x, i) => `<circle cx="${x}" cy="${210 + (i % 3) * 10}" r="${7 + (i % 2) * 4}" fill="#fff" opacity="${0.7 + (i % 2) * 0.2}"/><circle cx="${x - 2}" cy="${206 + (i % 3) * 10}" r="2" fill="#fff"/>`).join('')}</g>`
    case 'devils_advocate': return `<g><path d="M86 110 Q80 84 96 96 Z" fill="#dc2626"/><path d="M154 110 Q160 84 144 96 Z" fill="#dc2626"/><path d="M180 210 q22 12 10 30" stroke="#dc2626" stroke-width="4" fill="none"/><path d="M188 238 l8 -4 l-4 8 Z" fill="#dc2626"/><line x1="46" y1="220" x2="64" y2="200" stroke="#1a1030" stroke-width="3"/><path d="M44 222 l-8 -4 l6 8 l-6 2 Z" fill="#fbbf24"/></g>`
    default: return ''
  }
}

export function OttoMascot({ preset, skin, eyeColor, expressiveness, accessories, mood, size = 300, float = true }: Props) {
  const ex = Math.max(0, Math.min(1, expressiveness))
  const wobbleDur = (3.6 - 1.6 * ex).toFixed(2)
  const floatDur = (4.4 - 1.4 * ex).toFixed(2)
  const svg = useMemo(() => {
    const s = SKINS.find((x) => x.id === skin) || SKINS[0]
    const back = accessories.filter((a) => BACK_ACCESSORIES.includes(a)).map(accessory).join('')
    const front = accessories.filter((a) => !BACK_ACCESSORIES.includes(a)).map(accessory).join('')
    const body = `
      <ellipse class="lk-shadow" cx="120" cy="252" rx="58" ry="11" fill="#000" filter="url(#softer)"/>
      <ellipse cx="120" cy="152" rx="92" ry="82" fill="url(#glowG)" filter="url(#bloom)"/>
      ${back}
      <g class="lk-body">
        ${bodyShape(preset, s.stars)}
        ${face(mood, preset, eyeColor, ex)}
        <ellipse cx="74" cy="180" rx="11" ry="6" fill="#fb7185" opacity=".45"/>
        <ellipse cx="166" cy="180" rx="11" ry="6" fill="#fb7185" opacity=".45"/>
      </g>
      ${front}
      ${emote(mood)}`
    return `<svg class="lk-mascot" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg">${defs(skin)}${body}</svg>`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, skin, eyeColor, ex, accessories.join(','), mood])

  return (
    <div className={`lk-wrap${float ? ' lk-float' : ''}`} style={{ height: size }}>
      <style>{`
        .lk-wrap{position:relative;width:auto;aspect-ratio:240/300}
        .lk-float{animation:lkFloat ${floatDur}s ease-in-out infinite alternate}
        .lk-mascot{width:100%;height:100%;display:block;overflow:visible}
        .lk-body{transform-origin:120px 175px;animation:lkWobble ${wobbleDur}s ease-in-out infinite alternate}
        .lk-shadow{transform-origin:120px 250px;animation:lkShadow ${wobbleDur}s ease-in-out infinite alternate}
        .lk-emote{animation:lkEmote 1.8s ease-in-out infinite alternate}
        .lk-spark{animation:lkTwinkle 1.6s infinite}
        .lk-face{transition:transform .2s}
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
