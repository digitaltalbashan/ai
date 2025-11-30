import { prisma } from '../src/server/db/client'

async function main() {
  const email = process.argv[2] || 'tzmoyal@gmail.com'
  
  try {
    console.log(`🧹 Cleaning all data for user: ${email}\n`)
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      console.error(`❌ User not found: ${email}`)
      process.exit(1)
    }

    console.log(`✅ Found user: ${user.email} (${user.id})\n`)

    // Get counts before deletion
    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    })

    const totalMessages = conversations.reduce((sum, conv) => sum + conv._count.messages, 0)
    const memories = await prisma.userMemory.count({
      where: { userId: user.id },
    })
    const contexts = await prisma.userContext.count({
      where: { userId: user.id },
    })

    console.log(`📊 Current data:`)
    console.log(`   Conversations: ${conversations.length}`)
    console.log(`   Messages: ${totalMessages}`)
    console.log(`   Memories: ${memories}`)
    console.log(`   Contexts: ${contexts}\n`)

    // Delete messages (cascade will handle conversations)
    console.log('🗑️  Deleting messages...')
    const deletedMessages = await prisma.message.deleteMany({
      where: {
        conversation: {
          userId: user.id,
        },
      },
    })
    console.log(`   ✅ Deleted ${deletedMessages.count} messages`)

    // Delete conversations
    console.log('🗑️  Deleting conversations...')
    const deletedConversations = await prisma.conversation.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${deletedConversations.count} conversations`)

    // Delete memories
    console.log('🗑️  Deleting memories...')
    const deletedMemories = await prisma.userMemory.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${deletedMemories.count} memories`)

    // Delete user context (long-term memory)
    console.log('🗑️  Deleting user context...')
    const deletedContexts = await prisma.userContext.deleteMany({
      where: { userId: user.id },
    })
    console.log(`   ✅ Deleted ${deletedContexts.count} contexts`)

    console.log('\n✅ All user data cleaned successfully!')
    console.log(`\n📊 Summary:`)
    console.log(`   Messages deleted: ${deletedMessages.count}`)
    console.log(`   Conversations deleted: ${deletedConversations.count}`)
    console.log(`   Memories deleted: ${deletedMemories.count}`)
    console.log(`   Contexts deleted: ${deletedContexts.count}`)

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

