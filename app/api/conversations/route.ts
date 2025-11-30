import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/src/auth'
import { prisma } from '@/src/server/db/client'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    const userId = (session?.user as any)?.id
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Get the single conversation for the user (or create if doesn't exist)
    let conversation = await prisma.conversation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' }, // Get the first (oldest) conversation
      include: {
        _count: {
          select: { messages: true },
        },
      },
    })

    // If no conversation exists, create one
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: 'השיחה שלי',
        },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      })
    }

    // Format response - return single conversation
    const formattedConversation = {
      id: conversation.id,
      title: conversation.title || 'השיחה שלי',
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation._count.messages,
    }

    return NextResponse.json({ conversation: formattedConversation })
  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

