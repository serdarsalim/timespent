import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET: Analyze database to see what's taking up space
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

    // Fetch ALL data from Neon to analyze
    const [
      scheduleEntries,
      productivityRatings,
      weeklyNotes,
      monthEntries,
      goals,
      focusAreas
    ] = await Promise.all([
      prisma.scheduleEntry.findMany({ where: { userId: user.id } }),
      prisma.productivityRating.findMany({ where: { userId: user.id } }),
      prisma.weeklyNote.findMany({ where: { userId: user.id } }),
      prisma.monthEntry.findMany({ where: { userId: user.id } }),
      prisma.goal.findMany({ where: { userId: user.id }, include: { keyResults: true } }),
      prisma.focusArea.findMany({ where: { userId: user.id } })
    ])

    // Calculate sizes
    const estimateSize = (data: any) => {
      const str = JSON.stringify(data)
      return {
        bytes: str.length,
        kb: Math.round(str.length / 1024 * 100) / 100,
        mb: Math.round(str.length / 1024 / 1024 * 100) / 100
      }
    }

    // Calculate cutoff date (90 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)

    // Analyze schedule entries
    const oldScheduleEntries = scheduleEntries.filter(entry => {
      const match = entry.dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (match) {
        const [, year, month, day] = match
        const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        return entryDate < cutoffDate
      }
      return false
    })

    // Analyze productivity ratings
    const oldProductivityRatings = productivityRatings.filter(rating => {
      const match = rating.key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (match) {
        const [, year, month, day] = match
        const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        return entryDate < cutoffDate
      }
      return false
    })

    return NextResponse.json({
      analysis: {
        scheduleEntries: {
          total: scheduleEntries.length,
          oldEntries: oldScheduleEntries.length,
          size: estimateSize(scheduleEntries)
        },
        productivityRatings: {
          total: productivityRatings.length,
          oldEntries: oldProductivityRatings.length,
          size: estimateSize(productivityRatings)
        },
        weeklyNotes: {
          total: weeklyNotes.length,
          size: estimateSize(weeklyNotes),
          avgContentLength: weeklyNotes.length > 0
            ? Math.round(weeklyNotes.reduce((sum, n) => sum + n.content.length, 0) / weeklyNotes.length)
            : 0
        },
        monthEntries: {
          total: monthEntries.length,
          size: estimateSize(monthEntries),
          avgContentLength: monthEntries.length > 0
            ? Math.round(monthEntries.reduce((sum, m) => sum + m.content.length, 0) / monthEntries.length)
            : 0
        },
        goals: {
          total: goals.length,
          size: estimateSize(goals)
        },
        focusAreas: {
          total: focusAreas.length,
          size: estimateSize(focusAreas)
        }
      }
    })
  } catch (error) {
    console.error('Error analyzing database:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Clean up old data from database
 */
export async function POST() {
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

    // Calculate cutoff date (90 days ago)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)

    // Fetch all entries
    const [scheduleEntries, productivityRatings] = await Promise.all([
      prisma.scheduleEntry.findMany({
        where: { userId: user.id },
        select: { id: true, dayKey: true }
      }),
      prisma.productivityRating.findMany({
        where: { userId: user.id },
        select: { id: true, key: true }
      })
    ])

    // Find old schedule entries
    const oldScheduleIds: string[] = []
    for (const entry of scheduleEntries) {
      const match = entry.dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (match) {
        const [, year, month, day] = match
        const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (entryDate < cutoffDate) {
          oldScheduleIds.push(entry.id)
        }
      }
    }

    // Find old productivity ratings
    const oldProductivityIds: string[] = []
    for (const rating of productivityRatings) {
      const match = rating.key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (match) {
        const [, year, month, day] = match
        const entryDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (entryDate < cutoffDate) {
          oldProductivityIds.push(rating.id)
        }
      }
    }

    // Delete old data
    const [scheduleDeleted, productivityDeleted] = await Promise.all([
      oldScheduleIds.length > 0
        ? prisma.scheduleEntry.deleteMany({ where: { id: { in: oldScheduleIds } } })
        : { count: 0 },
      oldProductivityIds.length > 0
        ? prisma.productivityRating.deleteMany({ where: { id: { in: oldProductivityIds } } })
        : { count: 0 }
    ])

    return NextResponse.json({
      success: true,
      deleted: {
        scheduleEntries: scheduleDeleted.count,
        productivityRatings: productivityDeleted.count
      },
      cutoffDate: cutoffDate.toISOString().split('T')[0]
    })
  } catch (error) {
    console.error('Error cleaning up database:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
