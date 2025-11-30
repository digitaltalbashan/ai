import { prisma } from '../src/server/db/client'

async function main() {
  try {
    console.log('🔍 Checking user memories in database...\n')
    
    // Get all users with their memories
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        memories: {
          select: {
            id: true,
            summary: true,
            memoryType: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            memories: true,
            conversations: true,
          },
        },
      },
    })

    console.log(`📊 Total users: ${users.length}\n`)
    console.log('='.repeat(80))
    
    if (users.length === 0) {
      console.log('❌ No users found in database')
      return
    }

    let totalMemories = 0
    let usersWithMemories = 0

    for (const user of users) {
      const memoryCount = user._count.memories
      totalMemories += memoryCount
      
      if (memoryCount > 0) {
        usersWithMemories++
      }

      // Get message count from conversations
      const conversations = await prisma.conversation.findMany({
        where: { userId: user.id },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      })
      const totalMessages = conversations.reduce((sum, conv) => sum + conv._count.messages, 0)

      console.log(`\n👤 User: ${user.name || user.email || 'Unknown'}`)
      console.log(`   Email: ${user.email || 'N/A'}`)
      console.log(`   Conversations: ${user._count.conversations}`)
      console.log(`   Messages: ${totalMessages}`)
      console.log(`   Memories: ${memoryCount}`)
      
      if (memoryCount > 0) {
        console.log(`\n   📝 Recent memories:`)
        user.memories.slice(0, 3).forEach((memory, idx) => {
          console.log(`\n   [${idx + 1}] ${memory.memoryType}`)
          console.log(`       Created: ${memory.createdAt.toLocaleString('he-IL')}`)
          console.log(`       Summary: ${memory.summary.substring(0, 150)}...`)
        })
        if (memoryCount > 3) {
          console.log(`   ... and ${memoryCount - 3} more memories`)
        }
      } else {
        console.log(`   ⚠️  No memories found for this user`)
      }
      console.log('   ' + '-'.repeat(76))
    }

    console.log('\n' + '='.repeat(80))
    console.log('\n📈 Summary:')
    console.log(`   Total users: ${users.length}`)
    console.log(`   Users with memories: ${usersWithMemories}`)
    console.log(`   Total memories: ${totalMemories}`)
    console.log(`   Average memories per user: ${(totalMemories / users.length).toFixed(2)}`)
    
    if (totalMemories === 0) {
      console.log('\n⚠️  WARNING: No memories found in database!')
      console.log('   This could mean:')
      console.log('   1. Memory creation is not being triggered')
      console.log('   2. Users have not had conversations yet')
      console.log('   3. Memory creation is failing silently')
    }

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

