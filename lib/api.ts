// API service layer for data operations

// Transform flat array of schedule entries to grouped by dayKey
function transformScheduleFromDB(entries: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {}
  if (!Array.isArray(entries)) {
    console.error('transformScheduleFromDB: entries is not an array', entries)
    return grouped
  }
  for (const entry of entries) {
    const { dayKey, ...rest } = entry
    if (!grouped[dayKey]) {
      grouped[dayKey] = []
    }
    grouped[dayKey].push(rest)
  }
  return grouped
}

// Transform grouped schedule entries to flat array with dayKey field
function transformScheduleToDB(grouped: Record<string, any[]>): any[] {
  const flat: any[] = []
  for (const [dayKey, entries] of Object.entries(grouped)) {
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

// Transform weekly notes from array to object
function transformWeeklyNotesFromDB(notes: any[]): Record<string, string> {
  const obj: Record<string, string> = {}
  if (!Array.isArray(notes)) {
    console.error('transformWeeklyNotesFromDB: notes is not an array', notes)
    return obj
  }
  for (const note of notes) {
    obj[note.weekKey] = note.content
  }
  return obj
}

// Transform weekly notes from object to array
function transformWeeklyNotesToDB(obj: Record<string, string>): any[] {
  return Object.entries(obj).map(([weekKey, content]) => ({ weekKey, content }))
}

// Transform month entries from array to object
function transformMonthEntriesFromDB(entries: any[]): Record<string, string> {
  const obj: Record<string, string> = {}
  if (!Array.isArray(entries)) {
    console.error('transformMonthEntriesFromDB: entries is not an array', entries)
    return obj
  }
  for (const entry of entries) {
    obj[entry.monthKey] = entry.content
  }
  return obj
}

// Transform month entries from object to array
function transformMonthEntriesToDB(obj: Record<string, string>): any[] {
  return Object.entries(obj).map(([monthKey, content]) => ({ monthKey, content }))
}

export async function loadAllData() {
  try {
    const [
      goalsRes,
      scheduleRes,
      productivityRes,
      weeklyNotesRes,
      focusAreasRes,
      monthEntriesRes,
      profileRes
    ] = await Promise.all([
      fetch('/api/goals'),
      fetch('/api/schedule'),
      fetch('/api/productivity'),
      fetch('/api/weekly-notes'),
      fetch('/api/focus-areas'),
      fetch('/api/month-entries'),
      fetch('/api/profile')
    ])

    const [
      { goals },
      { scheduleEntries },
      { productivityRatings },
      { weeklyNotes },
      { focusAreas },
      { monthEntries },
      { profile }
    ] = await Promise.all([
      goalsRes.json(),
      scheduleRes.json(),
      productivityRes.json(),
      weeklyNotesRes.json(),
      focusAreasRes.json(),
      monthEntriesRes.json(),
      profileRes.json()
    ])

    return {
      goals: goals || [],
      scheduleEntries: transformScheduleFromDB(scheduleEntries || []),
      productivityRatings: transformProductivityFromDB(productivityRatings || []),
      weeklyNotes: transformWeeklyNotesFromDB(weeklyNotes || []),
      focusAreas: focusAreas || [],
      monthEntries: transformMonthEntriesFromDB(monthEntries || []),
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
    const data = await response.json()
    return data.goals
  } catch (error) {
    console.error('Error saving goals:', error)
    return null
  }
}

export async function saveSchedule(scheduleEntries: Record<string, any[]>) {
  try {
    const flat = transformScheduleToDB(scheduleEntries)
    const response = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleEntries: flat })
    })
    const data = await response.json()
    return transformScheduleFromDB(data.scheduleEntries)
  } catch (error) {
    console.error('Error saving schedule:', error)
    return null
  }
}

export async function saveProductivity(productivityRatings: Record<string, number | null>) {
  try {
    const array = transformProductivityToDB(productivityRatings)
    const response = await fetch('/api/productivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productivityRatings: array })
    })

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

export async function saveWeeklyNotes(weeklyNotes: Record<string, string>) {
  try {
    const array = transformWeeklyNotesToDB(weeklyNotes)
    const response = await fetch('/api/weekly-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyNotes: array })
    })
    const data = await response.json()
    return transformWeeklyNotesFromDB(data.weeklyNotes)
  } catch (error) {
    console.error('Error saving weekly notes:', error)
    return null
  }
}

export async function saveFocusAreas(focusAreas: any[]) {
  try {
    const response = await fetch('/api/focus-areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusAreas })
    })
    const data = await response.json()
    return data.focusAreas
  } catch (error) {
    console.error('Error saving focus areas:', error)
    return null
  }
}

export async function saveMonthEntries(monthEntries: Record<string, string>) {
  try {
    const array = transformMonthEntriesToDB(monthEntries)
    const response = await fetch('/api/month-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthEntries: array })
    })
    const data = await response.json()
    return transformMonthEntriesFromDB(data.monthEntries)
  } catch (error) {
    console.error('Error saving month entries:', error)
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
    const data = await response.json()
    return data.profile
  } catch (error) {
    console.error('Error saving profile:', error)
    return null
  }
}
