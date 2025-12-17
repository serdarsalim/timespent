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
        focusAreas: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ focusAreas: user?.focusAreas || [] })
  } catch (error) {
    console.error('Error fetching focus areas:', error)
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

    const { focusAreas } = await request.json()

    // Delete existing focus areas for this user
    await prisma.focusArea.deleteMany({
      where: { userId: user.id }
    })

    // Create new focus areas
    if (focusAreas && focusAreas.length > 0) {
      await prisma.focusArea.createMany({
        data: focusAreas.map((area: any, index: number) => ({
          userId: user.id,
          name: area.name,
          hours: area.hours,
          order: area.order !== undefined ? area.order : index,
        }))
      })
    }

    // Fetch and return updated focus areas
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        focusAreas: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ focusAreas: updatedUser?.focusAreas || [] })
  } catch (error) {
    console.error('Error saving focus areas:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
