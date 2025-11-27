// Test model answers quality for specific questions
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'

interface TestQuestion {
  id: string
  question: string
  expectedTopics: string[] // Topics that should appear in the answer
  expectedConcepts: string[] // Key concepts that should be mentioned
  minAnswerLength: number // Minimum expected answer length
}

const testQuestions: TestQuestion[] = [
  {
    id: 'circle_of_consciousness',
    question: 'מה זה מעגל התודעה?',
    expectedTopics: ['מעגל התודעה'],
    expectedConcepts: ['מעגל התודעה', 'מסמך', 'תרגול', 'מאמן'],
    minAnswerLength: 100
  },
  {
    id: 'r_a_c_consciousness',
    question: 'מה ההבדל בין תודעת R, תודעת A ותודעת C?',
    expectedTopics: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית'],
    expectedConcepts: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית', 'R', 'A', 'C'],
    minAnswerLength: 150
  },
  {
    id: 'gap_between_want_and_experience',
    question: 'למה אתה אומר שיש פער בין מה שאנחנו רוצים לבין מה שאנחנו חווים?',
    expectedTopics: ['רצון חופשי', 'תת מודע', 'פחד', 'מציאות'],
    expectedConcepts: ['רצון חופשי', 'תת מודע', 'פחד', 'מציאות', 'פער'],
    minAnswerLength: 150
  },
  {
    id: 'stuckness_explanation',
    question: 'מה ההסבר לתחושת תקיעות מבחינה תודעתית?',
    expectedTopics: ['תודעה ראקטיבית', 'תת מודע', 'פחד', 'תקיעות'],
    expectedConcepts: ['תודעה ראקטיבית', 'תת מודע', 'פחד', 'תקיעות', 'התנהגות'],
    minAnswerLength: 150
  },
  {
    id: 'burnout_explanation',
    question: 'איך נוצרת שחיקה אצל אדם לפי ההסבר בקורס?',
    expectedTopics: ['שחיקה', 'תודעה ראקטיבית', 'פחד', 'מציאות'],
    expectedConcepts: ['שחיקה', 'תודעה ראקטיבית', 'פחד', 'מציאות'],
    minAnswerLength: 100
  }
]

interface AnswerQuality {
  question: string
  answer: string
  answerLength: number
  topicsFound: string[]
  topicsMissing: string[]
  conceptsFound: string[]
  conceptsMissing: string[]
  ragChunksUsed: number
  ragChunkIds: string[]
  hasRagContext: boolean
  score: number
  issues: string[]
}

async function testQuestion(question: TestQuestion): Promise<AnswerQuality> {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📝 שאלה: ${question.question}`)
  console.log(`${'='.repeat(80)}`)

  // 1. Search RAG
  const knowledgeChunks = await searchKnowledge(question.question, 5)
  console.log(`📚 RAG: נמצאו ${knowledgeChunks.length} chunks רלוונטיים`)
  knowledgeChunks.forEach((chunk, idx) => {
    console.log(`   [${idx + 1}] ${chunk.id}: ${chunk.metadata?.title || 'ללא כותרת'}`)
  })

  // 2. Build prompt
  const promptMessages = buildPrompt(
    question.question,
    [], // No conversation history
    knowledgeChunks,
    []  // No user memories
  )

  // 3. Get answer from model
  console.log(`🤖 שואל את המודל...`)
  const completion = await chatCompletion(promptMessages, {
    temperature: 0.7,
    maxTokens: 1000,
  })

  const answer = completion.choices[0]?.message?.content?.trim() || ''
  console.log(`✅ תשובה התקבלה (${answer.length} תווים)`)

  // 4. Analyze answer quality
  const answerLower = answer.toLowerCase()
  
  const topicsFound = question.expectedTopics.filter(topic => 
    answerLower.includes(topic.toLowerCase())
  )
  const topicsMissing = question.expectedTopics.filter(topic => 
    !answerLower.includes(topic.toLowerCase())
  )

  const conceptsFound = question.expectedConcepts.filter(concept => 
    answerLower.includes(concept.toLowerCase())
  )
  const conceptsMissing = question.expectedConcepts.filter(concept => 
    !answerLower.includes(concept.toLowerCase())
  )

  const hasRagContext = knowledgeChunks.length > 0
  const hasMinimumLength = answer.length >= question.minAnswerLength

  // Calculate score (0-100)
  let score = 0
  const maxScore = 100

  // RAG context (30 points)
  if (hasRagContext) {
    score += 30
  }

  // Topics found (30 points)
  const topicScore = (topicsFound.length / question.expectedTopics.length) * 30
  score += topicScore

  // Concepts found (20 points)
  const conceptScore = (conceptsFound.length / question.expectedConcepts.length) * 20
  score += conceptScore

  // Minimum length (10 points)
  if (hasMinimumLength) {
    score += 10
  }

  // Answer completeness (10 points) - check if answer is not too short or generic
  if (answer.length > question.minAnswerLength * 1.5) {
    score += 10
  } else if (answer.length > question.minAnswerLength) {
    score += 5
  }

  // Collect issues
  const issues: string[] = []
  if (!hasRagContext) {
    issues.push('❌ אין RAG context - התשובה לא מבוססת על חומרי הקורס')
  }
  if (topicsMissing.length > 0) {
    issues.push(`⚠️  נושאים חסרים: ${topicsMissing.join(', ')}`)
  }
  if (conceptsMissing.length > 0) {
    issues.push(`⚠️  מושגים חסרים: ${conceptsMissing.join(', ')}`)
  }
  if (!hasMinimumLength) {
    issues.push(`⚠️  תשובה קצרה מדי (${answer.length} < ${question.minAnswerLength} תווים)`)
  }
  if (answer.includes('אין לי מספיק מידע')) {
    issues.push('❌ המודל אומר שאין לו מספיק מידע')
  }

  return {
    question: question.question,
    answer,
    answerLength: answer.length,
    topicsFound,
    topicsMissing,
    conceptsFound,
    conceptsMissing,
    ragChunksUsed: knowledgeChunks.length,
    ragChunkIds: knowledgeChunks.map(c => c.id),
    hasRagContext,
    score: Math.round(score),
    issues
  }
}

async function main() {
  console.log('🧪 בדיקת איכות תשובות המודל')
  console.log('='.repeat(80))
  console.log(`📋 ${testQuestions.length} שאלות לבדיקה\n`)

  const results: AnswerQuality[] = []

  for (const question of testQuestions) {
    try {
      const result = await testQuestion(question)
      results.push(result)
    } catch (error) {
      console.error(`❌ שגיאה בבדיקת שאלה "${question.question}":`, error)
      results.push({
        question: question.question,
        answer: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        answerLength: 0,
        topicsFound: [],
        topicsMissing: question.expectedTopics,
        conceptsFound: [],
        conceptsMissing: question.expectedConcepts,
        ragChunksUsed: 0,
        ragChunkIds: [],
        hasRagContext: false,
        score: 0,
        issues: [`❌ שגיאה: ${error instanceof Error ? error.message : String(error)}`]
      })
    }
  }

  // Generate report
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 דוח איכות תשובות')
  console.log('='.repeat(80))

  for (const result of results) {
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`❓ שאלה: ${result.question}`)
    console.log(`📝 תשובה (${result.answerLength} תווים):`)
    console.log(`   ${result.answer.substring(0, 200)}${result.answer.length > 200 ? '...' : ''}`)
    console.log(`\n📊 ניתוח:`)
    console.log(`   ציון: ${result.score}/100`)
    console.log(`   RAG chunks: ${result.ragChunksUsed} (${result.ragChunkIds.join(', ')})`)
    console.log(`   נושאים נמצאו: ${result.topicsFound.length}/${result.topicsFound.length + result.topicsMissing.length} (${result.topicsFound.join(', ')})`)
    if (result.topicsMissing.length > 0) {
      console.log(`   נושאים חסרים: ${result.topicsMissing.join(', ')}`)
    }
    console.log(`   מושגים נמצאו: ${result.conceptsFound.length}/${result.conceptsFound.length + result.conceptsMissing.length} (${result.conceptsFound.join(', ')})`)
    if (result.conceptsMissing.length > 0) {
      console.log(`   מושגים חסרים: ${result.conceptsMissing.join(', ')}`)
    }
    if (result.issues.length > 0) {
      console.log(`\n⚠️  בעיות:`)
      result.issues.forEach(issue => console.log(`   ${issue}`))
    } else {
      console.log(`\n✅ אין בעיות - תשובה איכותית!`)
    }
  }

  // Overall statistics
  console.log(`\n\n${'='.repeat(80)}`)
  console.log('📈 סיכום כללי')
  console.log('='.repeat(80))

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
  const avgLength = results.reduce((sum, r) => sum + r.answerLength, 0) / results.length
  const totalRagChunks = results.reduce((sum, r) => sum + r.ragChunksUsed, 0)
  const questionsWithRag = results.filter(r => r.hasRagContext).length
  const questionsWithIssues = results.filter(r => r.issues.length > 0).length

  console.log(`\nציון ממוצע: ${Math.round(avgScore)}/100`)
  console.log(`אורך ממוצע של תשובה: ${Math.round(avgLength)} תווים`)
  console.log(`RAG chunks ממוצע לשאלה: ${(totalRagChunks / results.length).toFixed(1)}`)
  console.log(`שאלות עם RAG context: ${questionsWithRag}/${results.length} (${Math.round(questionsWithRag/results.length*100)}%)`)
  console.log(`שאלות עם בעיות: ${questionsWithIssues}/${results.length} (${Math.round(questionsWithIssues/results.length*100)}%)`)

  // Grade
  const grade = avgScore >= 90 ? 'A' : avgScore >= 80 ? 'B' : avgScore >= 70 ? 'C' : avgScore >= 60 ? 'D' : 'F'
  const status = avgScore >= 90 ? '✅ מצוין!' : avgScore >= 80 ? '✅ טוב' : avgScore >= 70 ? '⚠️  מקובל' : '❌ צריך שיפור'

  console.log(`\nציון כללי: ${grade} (${status})`)

  // Recommendations
  console.log(`\n💡 המלצות:`)
  const recommendations: string[] = []
  
  if (questionsWithRag < results.length) {
    recommendations.push(`לשפר את RAG retrieval - ${results.length - questionsWithRag} שאלות לא קיבלו RAG context`)
  }
  
  const lowScoreQuestions = results.filter(r => r.score < 70)
  if (lowScoreQuestions.length > 0) {
    recommendations.push(`לשפר תשובות לשאלות: ${lowScoreQuestions.map(q => q.question.substring(0, 30)).join(', ')}`)
  }
  
  const shortAnswers = results.filter(r => r.answerLength < 100)
  if (shortAnswers.length > 0) {
    recommendations.push(`להאריך תשובות קצרות - ${shortAnswers.length} תשובות קצרות מדי`)
  }

  if (recommendations.length === 0) {
    console.log('   ✅ אין המלצות - כל התשובות איכותיות!')
  } else {
    recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`)
    })
  }

  console.log('\n' + '='.repeat(80))

  await prisma.$disconnect()
}

main().catch(console.error)

