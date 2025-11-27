// Basic functionality test script
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'
import { prisma } from '../src/server/db/client'

async function testBasicFunctionality() {
  console.log('🧪 בדיקות בסיסיות של המערכת\n')
  console.log('='.repeat(80))

  // Test 1: Database connection
  console.log('\n📊 בדיקה 1: חיבור למסד הנתונים...')
  try {
    await prisma.$connect()
    const count = await prisma.knowledgeChunk.count()
    console.log(`✅ חיבור למסד הנתונים הצליח (${count} chunks במסד הנתונים)`)
  } catch (error) {
    console.error('❌ שגיאה בחיבור למסד הנתונים:', error)
    process.exit(1)
  }

  // Test 2: RAG Search
  console.log('\n🔍 בדיקה 2: RAG Search...')
  try {
    const query = 'מה זה מעגל התודעה?'
    const results = await searchKnowledge(query, 3)
    console.log(`✅ RAG Search הצליח (נמצאו ${results.length} chunks)`)
    if (results.length > 0) {
      console.log(`   Chunk ראשון: ${results[0].id} (${results[0].text.substring(0, 60)}...)`)
    } else {
      console.log('   ⚠️  לא נמצאו chunks - ייתכן שצריך לרוץ index')
    }
  } catch (error) {
    console.error('❌ שגיאה ב-RAG Search:', error)
    process.exit(1)
  }

  // Test 3: LLM Connection
  console.log('\n🤖 בדיקה 3: חיבור ל-LLM (Ollama)...')
  try {
    const testMessages = [
      {
        role: 'user' as const,
        content: 'תשובה קצרה בעברית: מה זה מעגל התודעה?'
      }
    ]
    const response = await chatCompletion(testMessages, {
      temperature: 0.3,
      maxTokens: 50
    })
    const answer = response.choices[0]?.message?.content || ''
    if (answer.length > 0) {
      console.log(`✅ LLM עובד (תשובה: ${answer.substring(0, 100)}...)`)
    } else {
      console.log('⚠️  LLM הגיב אבל התשובה ריקה')
    }
  } catch (error) {
    console.error('❌ שגיאה בחיבור ל-LLM:', error)
    console.error('   ודא ש-Ollama רץ: ollama serve')
    process.exit(1)
  }

  // Test 4: Full RAG + LLM
  console.log('\n🔄 בדיקה 4: RAG + LLM (תשובה מלאה)...')
  try {
    const query = 'מה זה מעגל התודעה?'
    const knowledgeChunks = await searchKnowledge(query, 3)
    const promptMessages = buildPrompt(query, [], knowledgeChunks, [])
    
    const response = await chatCompletion(promptMessages, {
      temperature: 0.3,
      maxTokens: 200
    })
    const answer = response.choices[0]?.message?.content || ''
    
    if (answer.length > 0) {
      console.log(`✅ תשובה מלאה התקבלה (${answer.length} תווים)`)
      console.log(`\n📝 תשובה:`)
      console.log(`   ${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}`)
    } else {
      console.log('⚠️  תשובה ריקה')
    }
  } catch (error) {
    console.error('❌ שגיאה בתשובה מלאה:', error)
    process.exit(1)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ כל הבדיקות הושלמו בהצלחה!')
  console.log('='.repeat(80))

  await prisma.$disconnect()
}

testBasicFunctionality().catch(console.error)

