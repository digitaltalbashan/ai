// POST /api/memory/update - Manually trigger memory update
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/server/db/client'
import { MessageSender } from '@prisma/client'
import { updateUserMemory } from '@/src/server/memory/update'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, conversationId, memoryType } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    // If conversationId provided, get messages from that conversation
    // Otherwise, get recent messages from all user conversations
    let messages
    if (conversationId) {
      messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      })
    } else {
      // Get recent messages from all conversations
      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      })

      if (conversations.length === 0) {
        return NextResponse.json(
          { error: 'No conversations found for user' },
          { status: 404 }
        )
      }

      messages = await prisma.message.findMany({
        where: { conversationId: conversations[0].id },
        orderBy: { createdAt: 'asc' },
      })
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found' },
        { status: 404 }
      )
    }

    // Update memory
    await updateUserMemory(
      userId,
      messages.map((m) => ({
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt,
      })),
      memoryType || 'SESSION_SUMMARY'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Memory update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

