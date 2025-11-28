import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/server/db/client"
import { requireAdmin } from "@/src/server/utils/admin"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check if user is admin
    await requireAdmin()

    const { userId } = params

    // Prevent deletion of admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: "tzmoyal@gmail.com" },
      select: { id: true },
    })
    
    if (adminUser && adminUser.id === userId) {
      return NextResponse.json(
        { error: "Cannot delete admin user" },
        { status: 400 }
      )
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: {
        id: userId,
      },
    })

    return NextResponse.json(
      { message: "User deleted successfully" },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("❌ [ADMIN API] Error deleting user:", error)
    
    if (error.message === "Unauthorized: Admin access required") {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    )
  }
}

