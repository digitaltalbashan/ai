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

    // Fetch memories for the user
    const memories = await prisma.userMemory.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ memories }, { status: 200 })
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error fetching memories:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch memories" },
      { status: 500 }
    )
  }
}

