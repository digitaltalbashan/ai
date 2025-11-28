import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/server/db/client"
import { requireAdmin } from "@/src/server/utils/admin"

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check if user is admin
    await requireAdmin()

    const { userId } = params

    // Fetch conversations for the user
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: userId,
      },
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json({ conversations }, { status: 200 })
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error fetching conversations:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    )
  }
}

