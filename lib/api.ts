// API service layer for data operations

// Transform flat array of schedule entries to grouped by dayKey
// Only includes entries from the last 90 days to prevent memory issues
function transformScheduleFromDB(entries: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {}
  if (!Array.isArray(entries)) {
    console.error('transformScheduleFromDB: entries is not an array', entries)
    return grouped
  }

  // Calculate cutoff date (90 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  cutoffDate.setHours(0, 0, 0, 0)

  for (const entry of entries) {
    const { dayKey, ...rest } = entry

    // Parse dayKey format: "YYYY-M-D"
    const match = dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (match) {
      const [, year, month, day] = match
      const entryDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      )

      // Skip entries older than 90 days
      if (entryDate < cutoffDate) {
        continue
      }
    }

    if (!grouped[dayKey]) {
      grouped[dayKey] = []
    }
    grouped[dayKey].push(rest)
  }
  return grouped
}

// Transform grouped schedule entries to flat array with dayKey field
// Only saves entries from the last 90 days to prevent database bloat
function transformScheduleToDB(grouped: Record<string, any[]>): any[] {
  const flat: any[] = []

  // Calculate cutoff date (90 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  cutoffDate.setHours(0, 0, 0, 0)

  for (const [dayKey, entries] of Object.entries(grouped)) {
    // Parse dayKey format: "YYYY-M-D"
    const match = dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (match) {
      const [, year, month, day] = match
      const entryDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      )

      // Skip entries older than 90 days
      if (entryDate < cutoffDate) {
        continue
      }
    }

    for (const entry of entries) {
      flat.push({
        dayKey,
        ...entry,
        // Ensure repeatDays is a string if it exists
        repeatDays: entry.repeatDays ? JSON.stringify(entry.repeatDays) : null
      })
    }
  }
  return flat
}

// Transform productivity ratings from object to array
function transformProductivityFromDB(ratings: any[]): Record<string, number | null> {
  const obj: Record<string, number | null> = {}
  if (!Array.isArray(ratings)) {
    console.error('transformProductivityFromDB: ratings is not an array', ratings)
    return obj
  }
  for (const rating of ratings) {
    obj[rating.key] = rating.rating
  }
  return obj
}

// Transform productivity ratings from object to array
function transformProductivityToDB(obj: Record<string, number | null>): any[] {
  return Object.entries(obj).map(([key, rating]) => ({ key, rating }))
}

function transformDayOffsFromDB(entries: any[]): Record<string, boolean> {
  const obj: Record<string, boolean> = {}
  if (!Array.isArray(entries)) {
    console.error('transformDayOffsFromDB: entries is not an array', entries)
    return obj
  }
  for (const entry of entries) {
    obj[entry.dayKey] = true
  }
  return obj
}

function transformDayOffsToDB(obj: Record<string, boolean>): any[] {
  return Object.entries(obj)
    .filter(([, value]) => value)
    .map(([dayKey]) => ({ dayKey }))
}

// Transform weekly notes from array to object
type WeeklyNotePayload = {
  content: string
  dos?: string
  donts?: string
}

function transformWeeklyNotesFromDB(notes: any[]): Record<string, WeeklyNotePayload> {
  const obj: Record<string, WeeklyNotePayload> = {}
  if (!Array.isArray(notes)) {
    console.error('transformWeeklyNotesFromDB: notes is not an array', notes)
    return obj
  }
  for (const note of notes) {
    obj[note.weekKey] = {
      content: note.content ?? '',
      dos: note.dos ?? '',
      donts: note.donts ?? ''
    }
  }
  return obj
}

// Transform weekly notes from object to array
function transformWeeklyNotesToDB(obj: Record<string, WeeklyNotePayload>): any[] {
  return Object.entries(obj).map(([weekKey, entry]) => ({
    weekKey,
    content: entry.content ?? '',
    dos: entry.dos ?? '',
    donts: entry.donts ?? ''
  }))
}

export async function loadAllData() {
  try {
    const [
      goalsRes,
      productivityRes,
      weeklyNotesRes,
      dayOffsRes,
      profileRes
    ] = await Promise.all([
      fetch('/api/goals'),
      fetch('/api/productivity'),
      fetch('/api/weekly-notes'),
      fetch('/api/day-offs'),
      fetch('/api/profile')
    ])

    const [
      { goals },
      { productivityRatings },
      { weeklyNotes },
      { dayOffs },
      { profile }
    ] = await Promise.all([
      goalsRes.json(),
      productivityRes.json(),
      weeklyNotesRes.json(),
      dayOffsRes.json(),
      profileRes.json()
    ])

    return {
      goals: goals || [],
      scheduleEntries: {},
      productivityRatings: transformProductivityFromDB(productivityRatings || []),
      weeklyNotes: transformWeeklyNotesFromDB(weeklyNotes || []),
      dayOffs: transformDayOffsFromDB(dayOffs || []),
      profile: profile || null
    }
  } catch (error) {
    console.error('Error loading data from API:', error)
    return null
  }
}

export async function saveGoals(goals: any[]) {
  try {
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals })
    })

    // Guest users will get 401, which is expected
    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      console.error('Error saving goals:', response.status, response.statusText, errorData)
      return null
    }

    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data.goals)) {
      console.error('Invalid goals response payload', data)
      return null
    }

    return data.goals
  } catch (error) {
    console.error('Error saving goals:', error)
    return null
  }
}

export async function saveSchedule(scheduleEntries: Record<string, any[]>) {
  // Schedule API has been deprecated
  return {}
}

export async function saveProductivity(productivityRatings: Record<string, number | null>) {
  try {
    const array = transformProductivityToDB(productivityRatings)
    const response = await fetch('/api/productivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productivityRatings: array })
    })

    // Guest users will get 401, which is expected
    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      console.error('Error response from API:', response.status, response.statusText)
      return null
    }

    const data = await response.json()

    if (!data || !data.productivityRatings) {
      console.error('Invalid response structure:', data)
      return null
    }

    return transformProductivityFromDB(data.productivityRatings)
  } catch (error) {
    console.error('Error saving productivity ratings:', error)
    return null
  }
}

export async function saveWeeklyNotes(weeklyNotes: Record<string, WeeklyNotePayload>) {
  try {
    const array = transformWeeklyNotesToDB(weeklyNotes)
    const response = await fetch('/api/weekly-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyNotes: array })
    })

    // Guest users will get 401, which is expected
    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      console.error('Error saving weekly notes:', response.status, response.statusText)
      return null
    }

    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data.weeklyNotes)) {
      console.error('Invalid weekly notes response payload', data)
      return null
    }

    return transformWeeklyNotesFromDB(data.weeklyNotes)
  } catch (error) {
    console.error('Error saving weekly notes:', error)
    return null
  }
}

export async function saveDayOffs(dayOffs: Record<string, boolean>) {
  try {
    const array = transformDayOffsToDB(dayOffs)
    const response = await fetch('/api/day-offs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayOffs: array })
    })

    if (response.status === 401) {
      return null
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      console.error('Error saving day offs:', response.status, response.statusText, errorData)
      return null
    }

    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data.dayOffs)) {
      console.error('Invalid day offs response payload', data)
      return null
    }

    return transformDayOffsFromDB(data.dayOffs)
  } catch (error) {
    console.error('Error saving day offs:', error)
    return null
  }
}

export async function saveProfile(profile: any) {
  try {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile })
    })

    // Guest users will get 401, which is expected
    if (response.status === 401) {
      return null
    }

    const data = await response.json()
    return data.profile
  } catch (error) {
    console.error('Error saving profile:', error)
    return null
  }
}
