import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/src/auth"
import { prisma } from "@/src/server/db/client"
import { requireAdmin } from "@/src/server/utils/admin"

export async function GET(request: NextRequest) {
  try {
    // Check if user is admin
    await requireAdmin()

    // Fetch all users with their related data
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            conversations: true,
            memories: true,
            accounts: true,
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ users }, { status: 200 })
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error fetching users:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    )
  }
}

