// Analyze RAG chunk overlap between different questions
import { searchKnowledge } from '../src/server/vector/search'
import { isConceptDefinitionQuestion } from '../src/server/prompt/buildPrompt'
import { prisma } from '../src/server/db/client'

const questions = [
  'מה זה מעגל התודעה?',
  'מה המטרה של מעגל התודעה בקורס?',
  'מה זה מודל R A C שאתה מדבר עליו בשיעור הראשון?',
  'תסביר מה זה תודעת R לפי הקורס.',
  'מה ההבדל בין תודעת A לתודעת C?',
  'למה אתה אומר שיש פער בין מה שאנחנו רוצים לבין מה שאנחנו חווים במציאות?'
]

interface QuestionResult {
  question: string
  chunks: Array<{ id: string; title: string; order: number; text: string }>
  isConcept: boolean
  numChunks: number
}

async function analyzeRagOverlap() {
  console.log('🔍 בודק איזה chunks חוזרים בין השאלות...\n')
  console.log('='.repeat(80))
  
  const results: QuestionResult[] = []
  
  // 1. חיפוש chunks לכל שאלה
  for (const question of questions) {
    const isConcept = isConceptDefinitionQuestion(question)
    const numChunks = isConcept ? 8 : 5
    
    console.log(`\n❓ שאלה: ${question}`)
    console.log(`   סוג: ${isConcept ? 'שאלת מושג (8 chunks)' : 'שאלה רגילה (5 chunks)'}`)
    
    const chunks = await searchKnowledge(question, numChunks)
    
    const chunkInfo = chunks.map(chunk => ({
      id: chunk.id,
      title: chunk.metadata?.title || chunk.id,
      order: chunk.metadata?.order ?? 0,
      text: chunk.text
    }))
    
    results.push({
      question,
      chunks: chunkInfo,
      isConcept,
      numChunks: chunks.length
    })
    
    console.log(`   נמצאו ${chunks.length} chunks:`)
    chunkInfo.forEach((chunk, idx) => {
      console.log(`     [${idx + 1}] ${chunk.id} - ${chunk.title} (order: ${chunk.order})`)
    })
  }
  
  // 2. ניתוח chunks חוזרים
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 ניתוח chunks חוזרים:')
  console.log('='.repeat(80))
  
  // יצירת מפה: chunk ID -> רשימת שאלות
  const chunkToQuestions = new Map<string, string[]>()
  
  results.forEach(result => {
    result.chunks.forEach(chunk => {
      if (!chunkToQuestions.has(chunk.id)) {
        chunkToQuestions.set(chunk.id, [])
      }
      chunkToQuestions.get(chunk.id)!.push(result.question)
    })
  })
  
  // מיון לפי כמות הופעות (הכי חוזר ראשון)
  const sortedChunks = Array.from(chunkToQuestions.entries())
    .sort((a, b) => b[1].length - a[1].length)
  
  console.log(`\n📈 סה"כ chunks ייחודיים: ${chunkToQuestions.size}`)
  console.log(`📈 chunks שמופיעים ביותר משאלה אחת: ${sortedChunks.filter(([_, qs]) => qs.length > 1).length}`)
  
  console.log('\n🔄 Chunks שמופיעים ביותר משאלה אחת:')
  sortedChunks
    .filter(([_, questions]) => questions.length > 1)
    .forEach(([chunkId, questions]) => {
      const chunkInfo = results
        .flatMap(r => r.chunks)
        .find(c => c.id === chunkId)
      
      console.log(`\n  📄 ${chunkId}`)
      console.log(`     כותרת: ${chunkInfo?.title || 'N/A'}`)
      console.log(`     Order: ${chunkInfo?.order || 'N/A'}`)
      console.log(`     מופיע ב-${questions.length} שאלות:`)
      questions.forEach((q, idx) => {
        console.log(`       ${idx + 1}. ${q}`)
      })
    })
  
  // 3. מטריצת חפיפה
  console.log('\n\n' + '='.repeat(80))
  console.log('📋 מטריצת חפיפה בין שאלות:')
  console.log('='.repeat(80))
  
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const q1 = results[i]
      const q2 = results[j]
      
      const q1ChunkIds = new Set(q1.chunks.map(c => c.id))
      const q2ChunkIds = new Set(q2.chunks.map(c => c.id))
      
      const overlap = [...q1ChunkIds].filter(id => q2ChunkIds.has(id))
      
      if (overlap.length > 0) {
        console.log(`\n  "${q1.question.substring(0, 40)}..."`)
        console.log(`  "${q2.question.substring(0, 40)}..."`)
        console.log(`  חפיפה: ${overlap.length} chunks`)
        overlap.forEach(chunkId => {
          const chunk = q1.chunks.find(c => c.id === chunkId)
          console.log(`    - ${chunkId} (${chunk?.title || 'N/A'})`)
        })
      }
    }
  }
  
  // 4. סטטיסטיקות
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 סטטיסטיקות:')
  console.log('='.repeat(80))
  
  const allChunkIds = new Set(results.flatMap(r => r.chunks.map(c => c.id)))
  const avgChunksPerQuestion = results.reduce((sum, r) => sum + r.chunks.length, 0) / results.length
  
  console.log(`\n  סה"כ שאלות: ${questions.length}`)
  console.log(`  סה"כ chunks ייחודיים: ${allChunkIds.size}`)
  console.log(`  ממוצע chunks לשאלה: ${avgChunksPerQuestion.toFixed(1)}`)
  console.log(`  שאלות מושג: ${results.filter(r => r.isConcept).length}`)
  console.log(`  שאלות רגילות: ${results.filter(r => !r.isConcept).length}`)
  
  // 5. בדיקת דיוק - איזה chunks רלוונטיים
  console.log('\n\n' + '='.repeat(80))
  console.log('✅ בדיקת דיוק - האם ה-chunks רלוונטיים?')
  console.log('='.repeat(80))
  
  for (const result of results) {
    console.log(`\n❓ "${result.question}"`)
    
    const relevantChunks = result.chunks.filter(chunk => {
      const chunkText = chunk.text.toLowerCase()
      const questionLower = result.question.toLowerCase()
      
      // בדיקה בסיסית - האם הטקסט מכיל מילות מפתח מהשאלה
      const questionWords = questionLower
        .split(/\s+/)
        .filter(word => word.length > 2)
        .filter(word => !['מה', 'זה', 'של', 'אתה', 'מדבר', 'עליו', 'למה', 'יש', 'בין', 'לפי', 'הקורס'].includes(word))
      
      return questionWords.some(word => chunkText.includes(word))
    })
    
    console.log(`   רלוונטיים: ${relevantChunks.length}/${result.chunks.length}`)
    if (relevantChunks.length < result.chunks.length) {
      const notRelevant = result.chunks.filter(c => 
        !relevantChunks.some(rc => rc.id === c.id)
      )
      console.log(`   ⚠️  לא רלוונטיים:`)
      notRelevant.forEach(c => {
        console.log(`      - ${c.id} (${c.title})`)
      })
    } else {
      console.log(`   ✅ כל ה-chunks נראים רלוונטיים`)
    }
  }
  
  await prisma.$disconnect()
}

analyzeRagOverlap().catch(console.error)

