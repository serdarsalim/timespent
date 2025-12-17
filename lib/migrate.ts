import {
  saveGoals,
  saveSchedule,
  saveProductivity,
  saveWeeklyNotes,
  saveFocusAreas,
  saveMonthEntries,
  saveProfile
} from './api'

export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    // Check if migration has already been done
    const migrationDone = window.localStorage.getItem('timespent-migration-done')
    if (migrationDone === 'true') {
      console.log('Migration already completed')
      return true
    }

    console.log('Starting migration from localStorage to database...')

    // Load all data from localStorage
    const goals = window.localStorage.getItem('timespent-goals')
    const schedule = window.localStorage.getItem('timespent-schedule-entries')
    const productivity = window.localStorage.getItem('timespent-productivity-ratings')
    const weeklyNotes = window.localStorage.getItem('timespent-weekly-notes')
    const focusAreas = window.localStorage.getItem('timespent-focus-areas')
    const monthEntries = window.localStorage.getItem('timespent-life-entries')
    const profile = window.localStorage.getItem('timespent-profile')
    const weekStart = window.localStorage.getItem('timespent-week-start')
    const recentYears = window.localStorage.getItem('timespent-recent-years')

    // Save to database
    const promises: Promise<any>[] = []

    if (goals) {
      const parsed = JSON.parse(goals)
      if (Array.isArray(parsed) && parsed.length > 0) {
        promises.push(saveGoals(parsed))
      }
    }

    if (schedule) {
      const parsed = JSON.parse(schedule)
      if (parsed && typeof parsed === 'object') {
        promises.push(saveSchedule(parsed))
      }
    }

    if (productivity) {
      const parsed = JSON.parse(productivity)
      if (parsed && typeof parsed === 'object') {
        promises.push(saveProductivity(parsed))
      }
    }

    if (weeklyNotes) {
      const parsed = JSON.parse(weeklyNotes)
      if (parsed && typeof parsed === 'object') {
        promises.push(saveWeeklyNotes(parsed))
      }
    }

    if (focusAreas) {
      const parsed = JSON.parse(focusAreas)
      if (Array.isArray(parsed) && parsed.length > 0) {
        promises.push(saveFocusAreas(parsed))
      }
    }

    if (monthEntries) {
      const parsed = JSON.parse(monthEntries)
      if (parsed && typeof parsed === 'object') {
        promises.push(saveMonthEntries(parsed))
      }
    }

    // Build profile object
    const profileData: any = {}
    if (profile) {
      const parsed = JSON.parse(profile)
      if (parsed.name) profileData.personName = parsed.name
      if (parsed.dateOfBirth) profileData.dateOfBirth = parsed.dateOfBirth
    }
    if (weekStart) {
      const parsedWeekStart = Number.parseInt(weekStart, 10)
      if (Number.isFinite(parsedWeekStart)) {
        profileData.weekStartDay = parsedWeekStart
      }
    }
    if (recentYears) {
      profileData.recentYears = recentYears
    }

    if (Object.keys(profileData).length > 0) {
      promises.push(saveProfile(profileData))
    }

    // Wait for all saves to complete
    await Promise.all(promises)

    // Mark migration as complete
    window.localStorage.setItem('timespent-migration-done', 'true')
    console.log('Migration completed successfully!')

    return true
  } catch (error) {
    console.error('Migration failed:', error)
    return false
  }
}
