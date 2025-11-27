// Script to check user conversations
import { prisma } from '../src/server/db/client'

async function main() {
  try {
    const email = 'tzmoyal@gmail.com'
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true
      }
    })

    if (!user) {
      console.log(`❌ משתמש ${email} לא נמצא במסד הנתונים`)
      return
    }

    // Get conversations
    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 5 // First 5 messages
        },
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    console.log(`📊 סה"כ שיחות: ${conversations.length}`)
    
    if (conversations.length === 0) {
      console.log(`⚠️ אין שיחות למשתמש הזה`)
      return
    }

    conversations.forEach((conv, i) => {
      console.log(`\n${i + 1}. שיחה: ${conv.title || 'ללא כותרת'}`)
      console.log(`   ID: ${conv.id}`)
      console.log(`   הודעות: ${conv._count.messages}`)
      console.log(`   נוצרה: ${conv.createdAt.toLocaleDateString('he-IL')}`)
      console.log(`   עודכנה: ${conv.updatedAt.toLocaleDateString('he-IL')}`)
      
      if (conv.messages.length > 0) {
        console.log(`   הודעות ראשונות:`)
        conv.messages.forEach((msg, j) => {
          const preview = msg.content.substring(0, 100)
          console.log(`      ${j + 1}. [${msg.sender}]: ${preview}${msg.content.length > 100 ? '...' : ''}`)
        })
      }
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

