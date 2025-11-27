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

    // Get all conversations for the user with message count
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1, // Just to check if conversation has messages
        },
        _count: {
          select: { messages: true },
        },
      },
    })

    // Format response
    const formattedConversations = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || `שיחה ${new Date(conv.createdAt).toLocaleDateString('he-IL')}`,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv._count.messages,
    }))

    return NextResponse.json({ conversations: formattedConversations })
  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

