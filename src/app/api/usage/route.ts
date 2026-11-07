import { NextResponse } from 'next/server'
import { checkRateLimit, LIMITS, PEAK_START, PEAK_END, getUserHour } from '@/lib/otto-brain'

// GET /api/usage — current rate limit status
export async function GET() {
  const rate = await checkRateLimit()
  const { hour, isPeak } = getUserHour()
  return NextResponse.json({
    ...rate,
    limits: LIMITS,
    peakWindow: { start: PEAK_START, end: PEAK_END, isPeak, currentHour: hour },
    model: 'Otto Perso',
  })
}
