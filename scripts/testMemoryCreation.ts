import { prisma } from '../src/server/db/client'
import { updateUserMemory } from '../src/server/memory/update'
import { MessageSender } from '@prisma/client'

async function main() {
  try {
    console.log('🧪 Testing memory creation...\n')
    
    // Find user with messages
    const user = await prisma.user.findFirst({
      where: {
        email: 'tzmoyal@gmail.com',
      },
    })

    if (!user) {
      console.error('❌ User not found')
      process.exit(1)
    }

    console.log(`✅ Found user: ${user.email} (${user.id})\n`)

    // Get user's conversation
    const conversation = await prisma.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (!conversation) {
      console.error('❌ No conversation found for user')
      process.exit(1)
    }

    console.log(`✅ Found conversation: ${conversation.id}\n`)

    // Get messages
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10, // Last 10 messages
    })

    if (messages.length === 0) {
      console.error('❌ No messages found')
      process.exit(1)
    }

    console.log(`✅ Found ${messages.length} messages\n`)
    console.log('📝 Creating memory from messages...\n')

    // Create memory
    await updateUserMemory(
      user.id,
      messages.map((m) => ({
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt,
      })),
      'SESSION_SUMMARY'
    )

    console.log('✅ Memory created successfully!\n')

    // Check if memory was created
    const memories = await prisma.userMemory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (memories.length > 0) {
      console.log('📚 Latest memory:')
      console.log(`   Type: ${memories[0].memoryType}`)
      console.log(`   Created: ${memories[0].createdAt.toLocaleString('he-IL')}`)
      console.log(`   Summary: ${memories[0].summary}\n`)
    }

    await prisma.$disconnect()
    console.log('✅ Test complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

