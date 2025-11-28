import { getServerSession } from "@/src/auth"

const ADMIN_EMAIL = "tzmoyal@gmail.com"

export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession()
  return session?.user?.email === ADMIN_EMAIL
}

export async function requireAdmin() {
  const isUserAdmin = await isAdmin()
  if (!isUserAdmin) {
    throw new Error("Unauthorized: Admin access required")
  }
  return true
}

