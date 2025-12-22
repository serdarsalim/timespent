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
        profile: true
      }
    })

    return NextResponse.json({ profile: user?.profile || null })
  } catch (error) {
    console.error('Error fetching profile:', error)
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
      where: { email: session.user.email },
      include: {
        profile: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { profile } = await request.json()

    let updatedProfile

    if (user.profile) {
      // Update existing profile
      updatedProfile = await prisma.userProfile.update({
        where: { userId: user.id },
        data: {
          personName: profile.personName || null,
          dateOfBirth: profile.dateOfBirth || null,
          weekStartDay: profile.weekStartDay ?? 0,
          recentYears: profile.recentYears || '10',
          goalsSectionTitle: profile.goalsSectionTitle || '2026 GOALS',
          productivityViewMode: profile.productivityViewMode || 'day',
          productivityScaleMode: profile.productivityScaleMode || '3',
          showLegend: profile.showLegend ?? true,
          weeklyGoalsTemplate: profile.weeklyGoalsTemplate ?? '',
        }
      })
    } else {
      // Create new profile
      updatedProfile = await prisma.userProfile.create({
        data: {
          userId: user.id,
          personName: profile.personName || null,
          dateOfBirth: profile.dateOfBirth || null,
          weekStartDay: profile.weekStartDay ?? 0,
          recentYears: profile.recentYears || '10',
          goalsSectionTitle: profile.goalsSectionTitle || '2026 GOALS',
          productivityViewMode: profile.productivityViewMode || 'day',
          productivityScaleMode: profile.productivityScaleMode || '3',
          showLegend: profile.showLegend ?? true,
          weeklyGoalsTemplate: profile.weeklyGoalsTemplate ?? '',
        }
      })
    }

    return NextResponse.json({ profile: updatedProfile })
  } catch (error) {
    console.error('Error saving profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
