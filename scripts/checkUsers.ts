// Script to check user statistics
import { prisma } from '../src/server/db/client'

async function main() {
  try {
    // Count total users
    const totalUsers = await prisma.user.count()
    console.log(`📊 סה"כ משתמשים רשומים: ${totalUsers}`)
    
    // Count users with conversations (active users)
    const activeUsers = await prisma.user.count({
      where: {
        conversations: {
          some: {}
        }
      }
    })
    console.log(`✅ משתמשים פעילים (עם שיחות): ${activeUsers}`)
    
    // Count recent users (last 24 hours)
    const recentUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`🆕 משתמשים חדשים (24 שעות אחרונות): ${recentUsers}`)
    
    // List all users with their email
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            conversations: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    console.log(`\n📋 רשימת משתמשים:`)
    users.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.email || user.name || 'ללא שם'} - ${user._count.conversations} שיחות (נוצר: ${user.createdAt.toLocaleDateString('he-IL')})`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

