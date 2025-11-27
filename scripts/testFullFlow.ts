// Full flow test - from question to OpenAI response
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env file
config({ path: resolve(process.cwd(), '.env') })

import { queryWithOpenAIRag } from '../src/server/vector/queryWithOpenAIRag'

async function testFullFlow() {
  console.log('🧪 בדיקה מלאה של ה-flow עם OpenAI\n')
  console.log('='.repeat(100))
  
  // Step 1: Check environment
  console.log('\n1️⃣ בדיקת משתני סביבה:')
  const useOpenAI = process.env.USE_OPENAI === 'true'
  const hasApiKey = !!process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  
  console.log(`   USE_OPENAI: ${useOpenAI ? '✅' : '❌'}`)
  console.log(`   OPENAI_API_KEY: ${hasApiKey ? '✅ קיים' : '❌ חסר'}`)
  console.log(`   OPENAI_MODEL: ${model}`)
  console.log(`   OPENAI_EMBEDDING_MODEL: ${embeddingModel}`)
  
  if (!useOpenAI || !hasApiKey) {
    console.log('\n❌ משתני סביבה לא מוגדרים נכון!')
    console.log('   ודא ש-USE_OPENAI=true ו-OPENAI_API_KEY מוגדר ב-.env')
    process.exit(1)
  }
  
  // Step 2: Test OpenAI API directly
  console.log('\n2️⃣ בודק חיבור ל-OpenAI API...')
  try {
    const { chatCompletion } = await import('../src/server/openai')
    const testResponse = await chatCompletion([
      {
        role: 'user',
        content: 'Say "Hello" in Hebrew'
      }
    ], {
      temperature: 0.3,
      maxTokens: 50
    })
    
    if (testResponse.choices[0]?.message?.content) {
      console.log(`   ✅ OpenAI API עובד!`)
      console.log(`   תשובה: ${testResponse.choices[0].message.content}`)
    } else {
      console.log('   ❌ OpenAI API לא החזיר תשובה')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('   ❌ שגיאה בחיבור ל-OpenAI API:')
    console.error(`   ${error.message}`)
    process.exit(1)
  }
  
  // Step 3: Test OpenAI Embeddings
  console.log('\n3️⃣ בודק OpenAI Embeddings...')
  try {
    const { embedText } = await import('../src/server/openai')
    const embedding = await embedText('test query')
    
    if (embedding && embedding.length > 0) {
      console.log(`   ✅ OpenAI Embeddings עובד!`)
      console.log(`   מימדים: ${embedding.length}`)
    } else {
      console.log('   ❌ OpenAI Embeddings לא החזיר וקטור')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('   ❌ שגיאה ב-OpenAI Embeddings:')
    console.error(`   ${error.message}`)
    process.exit(1)
  }
  
  // Step 4: Test RAG retrieval + OpenAI
  console.log('\n4️⃣ בודק RAG + OpenAI (השאלה המלאה)...')
  const testQuestion = 'מה זה ריאקטיביות?'
  
  try {
    console.log(`\n📝 שאלה: "${testQuestion}"`)
    console.log('   מחפש צ\'אנקים...')
    
    const startTime = Date.now()
    const result = await queryWithOpenAIRag(
      testQuestion,
      testQuestion,
      50, // topK
      8,  // topN
      undefined // userContext
    )
    const totalTime = (Date.now() - startTime) / 1000
    
    console.log(`\n✅ הצלחה!`)
    console.log(`   זמן כולל: ${totalTime.toFixed(2)} שניות`)
    console.log(`   צ'אנקים נמצאו: ${result.sources.length}`)
    
    if (result.timing) {
      console.log(`\n⏱️  Timing:`)
      console.log(`   Retrieve: ${result.timing.retrieve_time?.toFixed(2)}s`)
      console.log(`   LLM: ${result.timing.llm_time?.toFixed(2)}s`)
      console.log(`   Total: ${result.timing.total_time?.toFixed(2)}s`)
    }
    
    if (result.answer && result.answer.length > 0) {
      console.log(`\n📝 תשובה מ-OpenAI (${result.answer.length} תווים):`)
      console.log('-'.repeat(100))
      console.log(result.answer.substring(0, 500))
      if (result.answer.length > 500) {
        console.log('...')
      }
      console.log('-'.repeat(100))
      
      console.log(`\n✅ המערכת עובדת!`)
      console.log(`   - Python RAG retrieval: ✅`)
      console.log(`   - OpenAI API: ✅`)
      console.log(`   - תשובה התקבלה: ✅`)
    } else {
      console.log('\n❌ התשובה ריקה!')
      process.exit(1)
    }
    
    // Show sources
    if (result.sources.length > 0) {
      console.log(`\n📚 צ'אנקים שנמצאו (${result.sources.length}):`)
      result.sources.slice(0, 3).forEach((chunk, idx) => {
        console.log(`\n   [${idx + 1}] ${chunk.source}`)
        console.log(`       Score: ${chunk.rerank_score.toFixed(3)}`)
        console.log(`       Text: ${chunk.text.substring(0, 100)}...`)
      })
    } else {
      console.log('\n⚠️  לא נמצאו צ\'אנקים - ייתכן שהאינדקס ריק')
    }
    
  } catch (error) {
    console.error('\n❌ שגיאה בבדיקה:')
    console.error(error)
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`)
      if (error.stack) {
        console.error(`   Stack: ${error.stack.substring(0, 500)}...`)
      }
    }
    process.exit(1)
  }
  
  console.log('\n' + '='.repeat(100))
  console.log('✅ בדיקה הושלמה בהצלחה! המערכת עובדת עם OpenAI.')
  console.log('='.repeat(100))
}

testFullFlow().catch(console.error)
