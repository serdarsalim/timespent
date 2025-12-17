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
        monthEntries: true
      }
    })

    return NextResponse.json({ monthEntries: user?.monthEntries || [] })
  } catch (error) {
    console.error('Error fetching month entries:', error)
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

    const { monthEntries } = await request.json()

    // Delete existing month entries for this user
    await prisma.monthEntry.deleteMany({
      where: { userId: user.id }
    })

    // Create new month entries
    if (monthEntries && monthEntries.length > 0) {
      await prisma.monthEntry.createMany({
        data: monthEntries.map((entry: any) => ({
          userId: user.id,
          monthKey: entry.monthKey,
          content: entry.content,
        }))
      })
    }

    // Fetch and return updated month entries
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        monthEntries: true
      }
    })

    return NextResponse.json({ monthEntries: updatedUser?.monthEntries || [] })
  } catch (error) {
    console.error('Error saving month entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
