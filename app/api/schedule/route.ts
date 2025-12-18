import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'This API endpoint has been deprecated' },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json(
    { error: 'This API endpoint has been deprecated' },
    { status: 410 }
  )
}
