import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * Inspect schedule entries to see what's making them so large
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

    // Fetch schedule entries with full details
    const entries = await prisma.scheduleEntry.findMany({
      where: { userId: user.id }
    })

    // Analyze each entry
    const analysis = entries.map(entry => {
      const entrySize = JSON.stringify(entry).length
      return {
        id: entry.id,
        dayKey: entry.dayKey,
        title: entry.title,
        time: entry.time,
        endTime: entry.endTime,
        color: entry.color,
        repeat: entry.repeat,
        repeatDaysLength: entry.repeatDays?.length || 0,
        totalSize: entrySize,
        sizeKB: Math.round(entrySize / 1024 * 100) / 100,
        fields: {
          title: entry.title.length,
          color: entry.color?.length || 0,
          repeatDays: entry.repeatDays?.length || 0,
          time: entry.time.length,
          endTime: entry.endTime?.length || 0
        }
      }
    })

    // Sort by size
    analysis.sort((a, b) => b.totalSize - a.totalSize)

    return NextResponse.json({
      entries: analysis,
      totalEntries: entries.length,
      totalSize: JSON.stringify(entries).length,
      totalSizeKB: Math.round(JSON.stringify(entries).length / 1024 * 100) / 100,
      largestEntry: analysis[0]
    })
  } catch (error) {
    console.error('Error inspecting schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
