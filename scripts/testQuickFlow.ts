// Quick test - just verify OpenAI works
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

async function testQuickFlow() {
  console.log('🧪 בדיקה מהירה - OpenAI API\n')
  
  // Test OpenAI API
  console.log('1️⃣ בודק OpenAI Chat Completion...')
  try {
    const { chatCompletion } = await import('../src/server/openai')
    const response = await chatCompletion([
      {
        role: 'user',
        content: 'Say "Hello" in Hebrew in one word'
      }
    ], {
      temperature: 0.3,
      maxTokens: 20
    })
    
    if (response.choices[0]?.message?.content) {
      console.log(`   ✅ OpenAI API עובד!`)
      console.log(`   תשובה: ${response.choices[0].message.content}`)
    }
  } catch (error: any) {
    console.error(`   ❌ שגיאה: ${error.message}`)
    process.exit(1)
  }
  
  // Test Embeddings
  console.log('\n2️⃣ בודק OpenAI Embeddings...')
  try {
    const { embedText } = await import('../src/server/openai')
    const embedding = await embedText('test')
    
    if (embedding && embedding.length > 0) {
      console.log(`   ✅ Embeddings עובד!`)
      console.log(`   מימדים: ${embedding.length}`)
    }
  } catch (error: any) {
    console.error(`   ❌ שגיאה: ${error.message}`)
    process.exit(1)
  }
  
  console.log('\n✅ כל הבדיקות עברו בהצלחה!')
  console.log('   המערכת מוכנה לשימוש עם OpenAI.')
}

testQuickFlow().catch(console.error)

