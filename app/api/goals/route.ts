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
        goals: {
          include: {
            keyResults: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ goals: user?.goals || [] })
  } catch (error) {
    console.error('Error fetching goals:', error)
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

    const { goals } = await request.json()

    // Delete existing goals for this user (cascades to key results)
    await prisma.goal.deleteMany({
      where: { userId: user.id }
    })

    // Create new goals with key results
    if (goals && goals.length > 0) {
      await prisma.goal.createMany({
        data: goals.map((goal: any) => ({
          userId: user.id,
          title: goal.title,
          timeframe: goal.timeframe,
          statusOverride: goal.statusOverride || null,
        }))
      })

      // Fetch created goals to get IDs
      const createdGoals = await prisma.goal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' }
      })

      // Create key results for each goal
      for (let i = 0; i < goals.length; i++) {
        const goal = goals[i]
        const createdGoal = createdGoals[i]

        if (goal.keyResults && goal.keyResults.length > 0) {
          await prisma.keyResult.createMany({
            data: goal.keyResults.map((kr: any) => ({
              goalId: createdGoal.id,
              title: kr.title,
              status: kr.status || 'pending'
            }))
          })
        }
      }
    }

    // Fetch and return updated goals
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        goals: {
          include: {
            keyResults: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    return NextResponse.json({ goals: updatedUser?.goals || [] })
  } catch (error) {
    console.error('Error saving goals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
