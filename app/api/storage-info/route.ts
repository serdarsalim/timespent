import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * API endpoint to get storage information for all tables
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Count records in each table
    const [
      scheduleCount,
      productivityCount,
      weeklyNotesCount,
      monthEntriesCount,
      goalsCount,
      focusAreasCount
    ] = await Promise.all([
      prisma.scheduleEntry.count({ where: { userId: user.id } }),
      prisma.productivityRating.count({ where: { userId: user.id } }),
      prisma.weeklyNote.count({ where: { userId: user.id } }),
      prisma.monthEntry.count({ where: { userId: user.id } }),
      prisma.goal.count({ where: { userId: user.id } }),
      prisma.focusArea.count({ where: { userId: user.id } })
    ])

    // Get sample records to estimate size
    const [
      sampleProductivity,
      sampleWeeklyNotes,
      sampleMonthEntries
    ] = await Promise.all([
      prisma.productivityRating.findMany({
        where: { userId: user.id },
        take: 100
      }),
      prisma.weeklyNote.findMany({
        where: { userId: user.id },
        take: 10
      }),
      prisma.monthEntry.findMany({
        where: { userId: user.id },
        take: 10
      })
    ])

    // Estimate sizes (rough calculation)
    const estimateSize = (records: any[]) => {
      if (records.length === 0) return 0
      const avgSize = JSON.stringify(records).length / records.length
      return avgSize
    }

    return NextResponse.json({
      counts: {
        scheduleEntries: scheduleCount,
        productivityRatings: productivityCount,
        weeklyNotes: weeklyNotesCount,
        monthEntries: monthEntriesCount,
        goals: goalsCount,
        focusAreas: focusAreasCount
      },
      estimatedAvgSizes: {
        productivityRating: Math.round(estimateSize(sampleProductivity)),
        weeklyNote: Math.round(estimateSize(sampleWeeklyNotes)),
        monthEntry: Math.round(estimateSize(sampleMonthEntries))
      },
      samples: {
        oldestProductivity: sampleProductivity[0]?.key,
        newestProductivity: sampleProductivity[sampleProductivity.length - 1]?.key,
        weeklyNoteSizes: sampleWeeklyNotes.map(n => ({
          key: n.weekKey,
          size: n.content.length
        })),
        monthEntrySizes: sampleMonthEntries.map(m => ({
          key: m.monthKey,
          size: m.content.length
        }))
      }
    })
  } catch (error) {
    console.error('Error getting storage info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
