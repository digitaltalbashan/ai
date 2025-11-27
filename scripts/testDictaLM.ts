// Test script for Dicta-LM 2.0 model
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt, isConceptDefinitionQuestion } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'
import { prisma } from '../src/server/db/client'

const testQuestions = [
  'מה זה מעגל התודעה?',
  'מה זה תודעה ראקטיבית?',
  'מה ההבדל בין תודעת R, תודעת A ותודעת C?',
]

async function testQuestion(question: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`❓ שאלה: ${question}`)
  console.log(`${'='.repeat(80)}`)

  // Check if it's a concept question
  const isConcept = isConceptDefinitionQuestion(question)
  console.log(`🔍 זוהה כשאלת מושג: ${isConcept ? 'כן' : 'לא'}`)

  // Search RAG
  const numChunks = isConcept ? 8 : 5
  const knowledgeChunks = await searchKnowledge(question, numChunks)
  console.log(`📚 נמצאו ${knowledgeChunks.length} chunks`)

  // Build prompt
  const promptMessages = buildPrompt(question, [], knowledgeChunks, [])

  // Get answer
  console.log(`🤖 שואל את המודל Dicta-LM 2.0...`)
  const startTime = Date.now()
  const completion = await chatCompletion(promptMessages, {
    temperature: 0.3,
    maxTokens: 1500,
  })
  const duration = Date.now() - startTime

  const answer = completion.choices[0]?.message?.content?.trim() || ''
  console.log(`\n📝 תשובה (${answer.length} תווים, ${duration}ms):`)
  console.log(answer.substring(0, 600))
  if (answer.length > 600) {
    console.log('...')
  }
  console.log(`\n${'='.repeat(80)}`)

  // Check for issues
  const issues: string[] = []
  
  // Check for English words
  const englishWords = answer.match(/\b[A-Z][A-Z\s]{2,}\b/g) || []
  if (englishWords.length > 0) {
    issues.push(`❌ נמצאו מילים באנגלית: ${englishWords.join(', ')}`)
  }

  // Check for other languages
  const chineseChars = answer.match(/[\u4e00-\u9fff]/g)
  const russianChars = answer.match(/[а-яА-Я]/g)
  if (chineseChars) {
    issues.push(`❌ נמצאו תווים בסינית`)
  }
  if (russianChars) {
    issues.push(`❌ נמצאו תווים ברוסית`)
  }

  // Check for follow-up questions (for concept questions)
  if (isConcept) {
    const hasQuestionMark = answer.includes('?')
    if (!hasQuestionMark) {
      issues.push(`⚠️  לא נמצאו שאלות המשך (צריך 2 שאלות עם סימן שאלה)`)
    } else {
      const questionCount = (answer.match(/\?/g) || []).length
      if (questionCount < 2) {
        issues.push(`⚠️  נמצאו רק ${questionCount} שאלות (צריך 2)`)
      }
    }
  }

  // Check if answer mentions the concept correctly
  if (question.includes('מעגל התודעה')) {
    if (!answer.includes('מסמך') && !answer.includes('כלי') && !answer.includes('מעגל התודעה')) {
      issues.push(`⚠️  התשובה לא מזכירה שמעגל התודעה הוא מסמך/כלי`)
    }
  }

  // Check answer quality
  if (answer.length < 100) {
    issues.push(`⚠️  תשובה קצרה מדי (${answer.length} תווים)`)
  }

  if (issues.length > 0) {
    console.log(`\n⚠️  בעיות:`)
    issues.forEach(issue => console.log(`   ${issue}`))
  } else {
    console.log(`\n✅ אין בעיות - תשובה טובה!`)
  }

  return { question, answer, issues, duration }
}

async function main() {
  console.log('🧪 בדיקת Dicta-LM 2.0')
  console.log('='.repeat(80))
  console.log('📝 מודל: dicta-il/dictalm2.0-instruct')
  console.log('🌐 שרת: http://localhost:8000')
  console.log('='.repeat(80))

  // Check if server is running
  try {
    const response = await fetch('http://localhost:8000/status')
    const status = await response.json()
    console.log(`\n📊 מצב השרת: ${status.status}`)
    if (status.status !== 'ready') {
      console.log('⚠️  השרת לא מוכן - ממתין...')
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  } catch (error) {
    console.error('❌ שגיאה בחיבור לשרת:', error)
    console.log('💡 ודא שהשרת Python רץ: python3 scripts/dicta_lm_server.py')
    process.exit(1)
  }

  const results = []
  for (const question of testQuestions) {
    try {
      const result = await testQuestion(question)
      results.push(result)
    } catch (error) {
      console.error(`❌ שגיאה:`, error)
      results.push({ question, answer: '', issues: [`❌ שגיאה: ${error}`], duration: 0 })
    }
  }

  console.log(`\n\n${'='.repeat(80)}`)
  console.log('📊 סיכום')
  console.log('='.repeat(80))

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0)
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
  console.log(`\nסה"כ שאלות: ${results.length}`)
  console.log(`סה"כ בעיות: ${totalIssues}`)
  console.log(`זמן ממוצע לתשובה: ${Math.round(avgDuration)}ms`)

  if (totalIssues === 0) {
    console.log(`\n✅ כל התשובות תקינות!`)
  } else {
    console.log(`\n⚠️  יש בעיות שצריך לתקן`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)

