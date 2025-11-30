import { prisma } from '../src/server/db/client'
import { loadLongTermMemory } from '../src/server/memory/longTermMemory'

async function main() {
  const email = process.argv[2] || 'tzmoyal@gmail.com'
  
  try {
    console.log(`🧠 Showing memories for user: ${email}\n`)
    console.log('='.repeat(100))
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      console.error(`❌ User not found: ${email}`)
      process.exit(1)
    }

    console.log(`✅ Found user: ${user.email} (${user.id})\n`)

    // 1. Active Conversation Memory
    console.log('📋 ACTIVE CONVERSATION MEMORY')
    console.log('─'.repeat(100))
    
    const activeMemory = await prisma.userMemory.findFirst({
      where: {
        userId: user.id,
        memoryType: 'ACTIVE_CONVERSATION',
      },
    })

    if (activeMemory) {
      console.log(`\n📝 Summary:`)
      console.log(activeMemory.summary)
      console.log(`\n📅 Created: ${activeMemory.createdAt.toLocaleString('he-IL')}`)
      console.log(`📅 Updated: ${activeMemory.updatedAt.toLocaleString('he-IL')}`)
      console.log(`🆔 ID: ${activeMemory.id}`)
    } else {
      console.log('⚠️  No active conversation memory found')
    }

    console.log('\n' + '='.repeat(100))
    console.log('\n🗂️  LONG-TERM MEMORY')
    console.log('─'.repeat(100))

    // 2. Long-term Memory
    const longTermMemory = await loadLongTermMemory(user.id)

    if (longTermMemory && Object.keys(longTermMemory).length > 0) {
      console.log(`\n👤 Profile:`)
      if (longTermMemory.profile && Object.keys(longTermMemory.profile).length > 0) {
        Object.entries(longTermMemory.profile).forEach(([key, value]) => {
          if (value) {
            console.log(`   ${key}: ${value}`)
          }
        })
      } else {
        console.log('   (no profile info)')
      }

      console.log(`\n⭐ Preferences:`)
      if (longTermMemory.preferences && longTermMemory.preferences.length > 0) {
        longTermMemory.preferences.forEach((pref, idx) => {
          console.log(`   [${idx + 1}] ${pref}`)
        })
      } else {
        console.log('   (no preferences)')
      }

      console.log(`\n📚 Long-term Facts:`)
      if (longTermMemory.long_term_facts && longTermMemory.long_term_facts.length > 0) {
        longTermMemory.long_term_facts.forEach((fact, idx) => {
          console.log(`\n   [${idx + 1}] ${fact.importance.toUpperCase()}`)
          console.log(`       Text: ${fact.text}`)
          console.log(`       ID: ${fact.id}`)
          console.log(`       Updated: ${new Date(fact.last_updated).toLocaleString('he-IL')}`)
          if (fact.last_used) {
            console.log(`       Last Used: ${new Date(fact.last_used).toLocaleString('he-IL')}`)
          }
        })
      } else {
        console.log('   (no facts)')
      }

      console.log(`\n🎯 Conversation Themes:`)
      if (longTermMemory.conversation_themes && longTermMemory.conversation_themes.length > 0) {
        longTermMemory.conversation_themes.forEach((theme, idx) => {
          console.log(`   [${idx + 1}] ${theme}`)
        })
      } else {
        console.log('   (no themes)')
      }

      if (longTermMemory.memory_summary) {
        console.log(`\n📄 Memory Summary:`)
        console.log(`   ${longTermMemory.memory_summary}`)
      }

      console.log(`\n📅 Last Updated: ${new Date(longTermMemory.last_updated).toLocaleString('he-IL')}`)
    } else {
      console.log('⚠️  No long-term memory found (empty memory)')
    }

    // 3. Show full JSON for reference
    console.log('\n' + '='.repeat(100))
    console.log('\n📄 FULL LONG-TERM MEMORY (JSON):')
    console.log('─'.repeat(100))
    console.log(JSON.stringify(longTermMemory, null, 2))

    console.log('\n' + '='.repeat(100))
    console.log('\n✅ Done!')
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

