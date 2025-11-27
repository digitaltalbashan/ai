import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/src/auth'
import { prisma } from '@/src/server/db/client'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const conversationId = params.id

    // Get conversation with all messages
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId, // Ensure user owns this conversation
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Format messages
    const messages = conversation.messages.map(msg => ({
      id: msg.id,
      sender: msg.sender,
      content: msg.content,
      createdAt: msg.createdAt,
    }))

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages,
    })
  } catch (error) {
    console.error('Conversation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

