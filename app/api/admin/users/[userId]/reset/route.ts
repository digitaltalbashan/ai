import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/server/db/client"
import { requireAdmin } from "@/src/server/utils/admin"

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check if user is admin
    await requireAdmin()

    const { userId } = params

    // Get counts before deletion for response
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    })

    const totalMessages = conversations.reduce((sum, conv) => sum + conv._count.messages, 0)
    const memoriesCount = await prisma.userMemory.count({
      where: { userId },
    })
    const contextsCount = await prisma.userContext.count({
      where: { userId },
    })

    // Delete messages (cascade will handle conversations)
    const deletedMessages = await prisma.message.deleteMany({
      where: {
        conversation: {
          userId,
        },
      },
    })

    // Delete conversations
    const deletedConversations = await prisma.conversation.deleteMany({
      where: { userId },
    })

    // Delete memories
    const deletedMemories = await prisma.userMemory.deleteMany({
      where: { userId },
    })

    // Delete user context (long-term memory)
    const deletedContexts = await prisma.userContext.deleteMany({
      where: { userId },
    })

    return NextResponse.json(
      { 
        message: "User data reset successfully",
        deleted: {
          messages: deletedMessages.count,
          conversations: deletedConversations.count,
          memories: deletedMemories.count,
          contexts: deletedContexts.count,
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error resetting user data:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: "Failed to reset user data" },
      { status: 500 }
    )
  }
}

