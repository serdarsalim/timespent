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
        productivityRatings: true
      }
    })

    return NextResponse.json({ productivityRatings: user?.productivityRatings || [] })
  } catch (error) {
    console.error('Error fetching productivity ratings:', error)
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

    const { productivityRatings } = await request.json()

    // Delete existing productivity ratings for this user
    await prisma.productivityRating.deleteMany({
      where: { userId: user.id }
    })

    // Create new productivity ratings
    if (productivityRatings && productivityRatings.length > 0) {
      await prisma.productivityRating.createMany({
        data: productivityRatings.map((rating: any) => ({
          userId: user.id,
          key: rating.key,
          rating: rating.rating,
        }))
      })
    }

    // Fetch and return updated productivity ratings
    const updatedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        productivityRatings: true
      }
    })

    return NextResponse.json({ productivityRatings: updatedUser?.productivityRatings || [] })
  } catch (error) {
    console.error('Error saving productivity ratings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
