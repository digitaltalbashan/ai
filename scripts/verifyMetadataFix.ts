// Verify that metadata fix improved the results
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

async function verifyMetadataFix() {
  console.log('✅ בודק אם התיקון שיפר את התוצאות...\n')
  console.log('='.repeat(80))
  
  for (const question of questions) {
    const isConcept = isConceptDefinitionQuestion(question)
    const numChunks = isConcept ? 8 : 5
    
    console.log(`\n❓ שאלה: ${question}`)
    console.log(`   סוג: ${isConcept ? 'שאלת מושג (8 chunks)' : 'שאלה רגילה (5 chunks)'}`)
    
    const chunks = await searchKnowledge(question, numChunks)
    
    console.log(`\n   נמצאו ${chunks.length} chunks:`)
    chunks.forEach((chunk, idx) => {
      const title = chunk.metadata?.title || chunk.id
      const topic = chunk.metadata?.topic || 'N/A'
      const concepts = chunk.metadata?.key_concepts?.join(', ') || 'N/A'
      const hasMetadata = chunk.metadata?.topic && chunk.metadata?.key_concepts
      
      console.log(`\n     [${idx + 1}] ${chunk.id}`)
      console.log(`         Title: ${title}`)
      console.log(`         Topic: ${topic}`)
      console.log(`         Key Concepts: ${concepts}`)
      console.log(`         Has Metadata: ${hasMetadata ? '✅' : '❌'}`)
      
      // Check relevance
      const questionLower = question.toLowerCase()
      const topicLower = topic.toLowerCase()
      const conceptsLower = concepts.toLowerCase()
      const textLower = chunk.text.toLowerCase()
      
      const relevantByTopic = questionLower.includes('מעגל') && topicLower.includes('מעגל') ||
                              questionLower.includes('r a c') && (topicLower.includes('r') || topicLower.includes('a') || topicLower.includes('c')) ||
                              questionLower.includes('תודעת r') && (topicLower.includes('r') || topicLower.includes('ראקטיבית')) ||
                              questionLower.includes('תודעת a') && (topicLower.includes('a') || topicLower.includes('אקטיבית')) ||
                              questionLower.includes('תודעת c') && (topicLower.includes('c') || topicLower.includes('יצירתית')) ||
                              questionLower.includes('פער') && topicLower.includes('פער')
      
      const relevantByConcepts = conceptsLower.includes('מעגל') && questionLower.includes('מעגל') ||
                                 (conceptsLower.includes('r') || conceptsLower.includes('ראקטיבית')) && questionLower.includes('r') ||
                                 (conceptsLower.includes('a') || conceptsLower.includes('אקטיבית')) && questionLower.includes('a') ||
                                 (conceptsLower.includes('c') || conceptsLower.includes('יצירתית')) && questionLower.includes('c') ||
                                 conceptsLower.includes('פער') && questionLower.includes('פער')
      
      if (relevantByTopic || relevantByConcepts) {
        console.log(`         Relevance: ✅ רלוונטי לפי metadata`)
      } else if (hasMetadata) {
        console.log(`         Relevance: ⚠️  יש metadata אבל לא רלוונטי לשאלה`)
      } else {
        console.log(`         Relevance: ❌ אין metadata`)
      }
    })
  }
  
  await prisma.$disconnect()
}

verifyMetadataFix().catch(console.error)

