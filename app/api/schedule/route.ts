import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        scheduleEntries: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ scheduleEntries: user?.scheduleEntries || [] })
  } catch (error) {
    console.error('Error fetching schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const { scheduleEntries } = await request.json()

    // Delete existing schedule entries for this user
    await prisma.scheduleEntry.deleteMany({
      where: { userId: user.id }
    })

    // Create new schedule entries
    if (scheduleEntries && scheduleEntries.length > 0) {
      await prisma.scheduleEntry.createMany({
        data: scheduleEntries.map((entry: any) => ({
          userId: user.id,
          dayKey: entry.dayKey,
          time: entry.time,
          endTime: entry.endTime || null,
          title: entry.title,
          color: entry.color || null,
          repeat: entry.repeat || 'none',
          repeatDays: entry.repeatDays || null,
        }))
      })
    }

    // Fetch and return updated schedule entries
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        scheduleEntries: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ scheduleEntries: updatedUser?.scheduleEntries || [] })
  } catch (error) {
    console.error('Error saving schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
