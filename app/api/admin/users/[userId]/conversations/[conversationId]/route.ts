import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/server/db/client"
import { requireAdmin } from "@/src/server/utils/admin"

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string; conversationId: string } }
) {
  try {
    // Check if user is admin
    await requireAdmin()

    const { conversationId } = params

    // Fetch conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ conversation }, { status: 200 })
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error fetching conversation:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    )
  }
}

