// Test script for concept definition questions
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt, isConceptDefinitionQuestion } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'

const testQuestions = [
  'מה זה מעגל התודעה?',
  'מה זה תודעה ראקטיבית?',
  'מה ההבדל בין תודעת R, תודעת A ותודעת C?',
  'מה זה תת מודע?',
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
  console.log(`🤖 שואל את המודל...`)
  const completion = await chatCompletion(promptMessages, {
    temperature: 0.3,
    maxTokens: 1500,
  })

  const answer = completion.choices[0]?.message?.content?.trim() || ''
  console.log(`\n📝 תשובה (${answer.length} תווים):`)
  console.log(answer)
  console.log(`\n${'='.repeat(80)}`)

  // Check for issues
  const issues: string[] = []
  
  // Check for English words
  const englishWords = answer.match(/\b[A-Z][A-Z\s]+\b/g) || []
  if (englishWords.length > 0) {
    issues.push(`❌ נמצאו מילים באנגלית: ${englishWords.join(', ')}`)
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

  if (issues.length > 0) {
    console.log(`\n⚠️  בעיות:`)
    issues.forEach(issue => console.log(`   ${issue}`))
  } else {
    console.log(`\n✅ אין בעיות - תשובה טובה!`)
  }

  return { question, answer, issues }
}

async function main() {
  console.log('🧪 בדיקת שאלות מושגים')
  console.log('='.repeat(80))

  const results = []
  for (const question of testQuestions) {
    try {
      const result = await testQuestion(question)
      results.push(result)
    } catch (error) {
      console.error(`❌ שגיאה:`, error)
      results.push({ question, answer: '', issues: [`❌ שגיאה: ${error}`] })
    }
  }

  console.log(`\n\n${'='.repeat(80)}`)
  console.log('📊 סיכום')
  console.log('='.repeat(80))

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0)
  console.log(`\nסה"כ שאלות: ${results.length}`)
  console.log(`סה"כ בעיות: ${totalIssues}`)

  if (totalIssues === 0) {
    console.log(`\n✅ כל התשובות תקינות!`)
  } else {
    console.log(`\n⚠️  יש בעיות שצריך לתקן`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)

