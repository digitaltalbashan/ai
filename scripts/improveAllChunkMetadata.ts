// Script to improve metadata for ALL chunks in database
import { prisma } from '../src/server/db/client'

/**
 * Estimate tokens
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Analyze and improve chunk metadata
 */
function improveMetadata(chunk: { id: string; text: string; metadata: any; source: string | null }): any {
  const text = chunk.text.toLowerCase()
  const words = chunk.text.split(/\s+/).filter(Boolean)
  const metadata = chunk.metadata || {}
  
  // Determine chunk type
  let chunkType: 'intro' | 'content' | 'summary' | 'general' = 'content'
  
  const introIndicators = ['שלום', 'ברוכים', 'נתחיל', 'היום', 'בשיעור', 'בפרק', 'אנחנו']
  const summaryIndicators = ['סיכום', 'לסיכום', 'בסוף', 'לסיום', 'לכן', 'לסיכום', 'לסיכום']
  
  if (introIndicators.some(ind => text.includes(ind)) && text.length < 500) {
    chunkType = 'intro'
  } else if (summaryIndicators.some(ind => text.includes(ind))) {
    chunkType = 'summary'
  } else {
    // Check if chunk is too general
    const commonWords = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם', 'יותר', 'אנחנו', 'אני']
    const commonWordCount = words.filter(w => commonWords.includes(w.toLowerCase())).length
    if (commonWordCount > words.length * 0.35) {
      chunkType = 'general'
    }
  }
  
  // Extract topic (first meaningful sentence)
  const sentences = chunk.text.split(/[.!?]\s+/).filter(s => s.length > 20)
  let topic = metadata.topic || ''
  if (!topic && sentences.length > 0) {
    topic = sentences[0].substring(0, 100).trim()
    if (topic.length < 30 && sentences.length > 1) {
      topic = sentences[1].substring(0, 100).trim()
    }
  }
  
  // Extract key concepts
  const courseConcepts = [
    'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
    'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
    'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות',
    'קונפליקט', 'צמיחה', 'פיתוח אישי', 'מנהיגות',
    'R', 'A', 'C', 'תודעת R', 'תודעת A', 'תודעת C'
  ]
  
  const keyConcepts: string[] = metadata.key_concepts || []
  for (const concept of courseConcepts) {
    if (text.includes(concept.toLowerCase()) && !keyConcepts.includes(concept)) {
      keyConcepts.push(concept)
      if (keyConcepts.length >= 5) break
    }
  }
  
  return {
    ...metadata,
    topic: topic || metadata.topic,
    key_concepts: keyConcepts.length > 0 ? keyConcepts : metadata.key_concepts,
    word_count: words.length,
    token_count: estimateTokens(chunk.text),
    is_standalone: words.length > 100 && estimateTokens(chunk.text) > 50,
    chunk_type: chunkType,
    is_general: chunkType === 'general',
    updated_at: new Date().toISOString()
  }
}

async function main() {
  console.log('🔍 Improving metadata for ALL chunks...')
  console.log('='.repeat(80))
  
  // Get total count
  const totalCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM knowledge_chunks`
  )
  const total = Number(totalCount[0].count)
  
  console.log(`\n📊 Total chunks: ${total}`)
  console.log(`\n💾 Processing chunks...`)
  
  let processed = 0
  let updated = 0
  let errors = 0
  const batchSize = 100
  
  // Process in batches
  let offset = 0
  
  while (offset < total) {
    const chunks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, text, metadata, source 
       FROM knowledge_chunks 
       ORDER BY id 
       LIMIT $1 OFFSET $2`,
      batchSize,
      offset
    )
    
    if (chunks.length === 0) break
    
    for (const chunk of chunks) {
      try {
        const improvedMetadata = improveMetadata(chunk)
        
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_chunks 
           SET metadata = $1::jsonb
           WHERE id = $2`,
          JSON.stringify(improvedMetadata),
          chunk.id
        )
        
        updated++
        processed++
        
        if (processed % 500 === 0) {
          console.log(`   Progress: ${processed}/${total} (${(processed / total * 100).toFixed(1)}%)`)
        }
      } catch (error) {
        errors++
        if (errors <= 5) {
          console.error(`   ❌ Error updating ${chunk.id}:`, error)
        }
      }
    }
    
    offset += batchSize
  }
  
  console.log(`\n` + '='.repeat(80))
  console.log('✨ Metadata improvement complete!')
  console.log('='.repeat(80))
  console.log(`✅ Processed: ${processed}`)
  console.log(`✅ Updated: ${updated}`)
  console.log(`❌ Errors: ${errors}`)
  console.log('='.repeat(80))
  
  await prisma.$disconnect()
}

main().catch(console.error)

