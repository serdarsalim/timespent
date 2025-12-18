// Improved API layer with proper types, validation, and error handling

import { z } from 'zod'
import { apiGet, apiPost } from './api-client'
import {
  goalsArraySchema,
  scheduleEntriesSchema,
  productivityRatingsSchema,
  focusAreasArraySchema,
  weeklyNotesSchema,
  monthEntriesSchema,
  profileSchema,
  type Goal,
  type ScheduleEntry,
  type FocusArea,
  type Profile
} from './schemas'

// Transform functions (keep existing logic)
function transformScheduleFromDB(entries: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {}
  if (!Array.isArray(entries)) {
    console.error('transformScheduleFromDB: entries is not an array', entries)
    return grouped
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  cutoffDate.setHours(0, 0, 0, 0)

  for (const entry of entries) {
    const { dayKey, ...rest } = entry
    const match = dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (match) {
      const [, year, month, day] = match
      const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      if (entryDate < cutoffDate) continue
    }
    if (!grouped[dayKey]) grouped[dayKey] = []
    grouped[dayKey].push(rest)
  }
  return grouped
}

function transformScheduleToDB(grouped: Record<string, any[]>): any[] {
  const flat: any[] = []
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  cutoffDate.setHours(0, 0, 0, 0)

  for (const [dayKey, entries] of Object.entries(grouped)) {
    const match = dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (match) {
      const [, year, month, day] = match
      const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      if (entryDate < cutoffDate) continue
    }
    for (const entry of entries) {
      flat.push({
        dayKey,
        ...entry,
        repeatDays: entry.repeatDays ? JSON.stringify(entry.repeatDays) : null
      })
    }
  }
  return flat
}

function transformProductivityFromDB(ratings: any[]): Record<string, number | null> {
  const obj: Record<string, number | null> = {}
  if (!Array.isArray(ratings)) return obj
  for (const rating of ratings) {
    obj[rating.key] = rating.rating
  }
  return obj
}

function transformProductivityToDB(obj: Record<string, number | null>): any[] {
  return Object.entries(obj).map(([key, rating]) => ({ key, rating }))
}

function transformWeeklyNotesFromDB(notes: any[]): Record<string, string> {
  const obj: Record<string, string> = {}
  if (!Array.isArray(notes)) return obj
  for (const note of notes) {
    obj[note.weekKey] = note.content
  }
  return obj
}

function transformWeeklyNotesToDB(obj: Record<string, string>): any[] {
  return Object.entries(obj).map(([weekKey, content]) => ({ weekKey, content }))
}

function transformMonthEntriesFromDB(entries: any[]): Record<string, string> {
  const obj: Record<string, string> = {}
  if (!Array.isArray(entries)) return obj
  for (const entry of entries) {
    obj[entry.monthKey] = entry.content
  }
  return obj
}

function transformMonthEntriesToDB(obj: Record<string, string>): any[] {
  return Object.entries(obj).map(([monthKey, content]) => ({ monthKey, content }))
}

// API functions
export async function loadAllData() {
  try {
    const [goalsRes, productivityRes, weeklyNotesRes, focusAreasRes, monthEntriesRes, profileRes] =
      await Promise.all([
        apiGet('/api/goals'),
        apiGet('/api/productivity'),
        apiGet('/api/weekly-notes'),
        apiGet('/api/focus-areas'),
        apiGet('/api/month-entries'),
        apiGet('/api/profile')
      ])

    return {
      goals: goalsRes.success && goalsRes.data ? (goalsRes.data as any).goals || [] : [],
      scheduleEntries: {},
      productivityRatings: productivityRes.success && productivityRes.data ? transformProductivityFromDB((productivityRes.data as any).productivityRatings || []) : {},
      weeklyNotes: weeklyNotesRes.success && weeklyNotesRes.data ? transformWeeklyNotesFromDB((weeklyNotesRes.data as any).weeklyNotes || []) : {},
      focusAreas: focusAreasRes.success && focusAreasRes.data ? (focusAreasRes.data as any).focusAreas || [] : [],
      monthEntries: monthEntriesRes.success && monthEntriesRes.data ? transformMonthEntriesFromDB((monthEntriesRes.data as any).monthEntries || []) : {},
      profile: profileRes.success && profileRes.data ? (profileRes.data as any).profile || null : null
    }
  } catch (error) {
    console.error('Error loading data:', error)
    return null
  }
}

export async function saveGoals(goals: Goal[]) {
  const result = goalsArraySchema.safeParse(goals)
  if (!result.success) {
    console.error('Goals validation failed:', result.error)
    throw new Error('Invalid goals data')
  }

  const response = await apiPost('/api/goals', { goals: result.data })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save goals')
  }
  return (response.data as any)?.goals || []
}

export async function saveSchedule(scheduleEntries: Record<string, ScheduleEntry[]>) {
  // Schedule API has been deprecated
  return {}
}

export async function saveProductivity(productivityRatings: Record<string, number | null>) {
  const array = transformProductivityToDB(productivityRatings)
  const response = await apiPost('/api/productivity', { productivityRatings: array })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save productivity')
  }
  return transformProductivityFromDB((response.data as any)?.productivityRatings || [])
}

export async function saveWeeklyNotes(weeklyNotes: Record<string, string>) {
  const array = transformWeeklyNotesToDB(weeklyNotes)
  const response = await apiPost('/api/weekly-notes', { weeklyNotes: array })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save weekly notes')
  }
  return transformWeeklyNotesFromDB((response.data as any)?.weeklyNotes || [])
}

export async function saveFocusAreas(focusAreas: FocusArea[]) {
  const result = focusAreasArraySchema.safeParse(focusAreas)
  if (!result.success) {
    console.error('Focus areas validation failed:', result.error)
    throw new Error('Invalid focus areas data')
  }

  const response = await apiPost('/api/focus-areas', { focusAreas: result.data })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save focus areas')
  }
  return (response.data as any)?.focusAreas || []
}

export async function saveMonthEntries(monthEntries: Record<string, string>) {
  const array = transformMonthEntriesToDB(monthEntries)
  const response = await apiPost('/api/month-entries', { monthEntries: array })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save month entries')
  }
  return transformMonthEntriesFromDB((response.data as any)?.monthEntries || [])
}

export async function saveProfile(profile: Profile) {
  const result = profileSchema.safeParse(profile)
  if (!result.success) {
    console.error('Profile validation failed:', result.error)
    throw new Error('Invalid profile data')
  }

  const response = await apiPost('/api/profile', { profile: result.data })
  if (!response.success) {
    throw new Error(response.error || 'Failed to save profile')
  }
  return (response.data as any)?.profile || null
}
