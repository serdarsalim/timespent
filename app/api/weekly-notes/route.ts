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
        weeklyNotes: true
      }
    })

    return NextResponse.json({ weeklyNotes: user?.weeklyNotes || [] })
  } catch (error) {
    console.error('Error fetching weekly notes:', error)
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

    const { weeklyNotes } = await request.json()

    // Delete existing weekly notes for this user
    await prisma.weeklyNote.deleteMany({
      where: { userId: user.id }
    })

    // Create new weekly notes
    if (weeklyNotes && weeklyNotes.length > 0) {
      await prisma.weeklyNote.createMany({
        data: weeklyNotes.map((note: any) => ({
          userId: user.id,
          weekKey: note.weekKey,
          content: note.content,
        }))
      })
    }

    // Fetch and return updated weekly notes
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        weeklyNotes: true
      }
    })

    return NextResponse.json({ weeklyNotes: updatedUser?.weeklyNotes || [] })
  } catch (error) {
    console.error('Error saving weekly notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
