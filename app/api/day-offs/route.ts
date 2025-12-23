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
        dayOffs: true
      }
    })

    return NextResponse.json({ dayOffs: user?.dayOffs || [] })
  } catch (error) {
    console.error('Error fetching day offs:', error)
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

    const { dayOffs } = await request.json()

    await prisma.$transaction(async (tx) => {
      await tx.dayOff.deleteMany({
        where: { userId: user.id }
      })

      if (dayOffs && dayOffs.length > 0) {
        await tx.dayOff.createMany({
          data: dayOffs.map((entry: any) => ({
            userId: user.id,
            dayKey: entry.dayKey,
            isOff: entry.isOff ?? true
          }))
        })
      }
    })

    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        dayOffs: true
      }
    })

    return NextResponse.json({ dayOffs: updatedUser?.dayOffs || [] })
  } catch (error) {
    console.error('Error saving day offs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
