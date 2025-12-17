import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * DELETE all schedule entries - nuclear option for corrupted data
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

    // Get count before deletion
    const countBefore = await prisma.scheduleEntry.count({
      where: { userId: user.id }
    })

    // Nuclear option: delete ALL schedule entries
    await prisma.scheduleEntry.deleteMany({
      where: { userId: user.id }
    })

    return NextResponse.json({
      success: true,
      message: 'All schedule entries deleted',
      deletedCount: countBefore
    })
  } catch (error) {
    console.error('Error nuking schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
