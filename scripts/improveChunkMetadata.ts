// Script to improve metadata for problematic chunks
import { prisma } from '../src/server/db/client'

interface ChunkAnalysis {
  id: string
  text: string
  metadata: any
  source: string
  isGeneral: boolean
  suggestedTopic: string
  suggestedConcepts: string[]
}

/**
 * Analyze chunk to determine if it's too general
 */
function analyzeChunk(chunk: { id: string; text: string; metadata: any; source: string }): ChunkAnalysis {
  const text = chunk.text.toLowerCase()
  const metadata = chunk.metadata || {}
  
  // Check if chunk is too general (contains many common words)
  const commonWords = [
    'זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם', 'יותר',
    'אנחנו', 'אני', 'אתה', 'הוא', 'היא', 'הם', 'הן',
    'יש', 'אין', 'היה', 'תהיה', 'יהיה'
  ]
  
  const words = text.split(/\s+/)
  const commonWordCount = words.filter(w => commonWords.includes(w)).length
  const isGeneral = commonWordCount > words.length * 0.3 // More than 30% common words
  
  // Extract topic from first meaningful sentence
  const sentences = chunk.text.split(/[.!?]\s+/).filter(s => s.length > 20)
  let suggestedTopic = metadata.topic || ''
  if (!suggestedTopic && sentences.length > 0) {
    suggestedTopic = sentences[0].substring(0, 100).trim()
  }
  
  // Extract key concepts
  const courseConcepts = [
    'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
    'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
    'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות',
    'קונפליקט', 'צמיחה', 'פיתוח אישי', 'מנהיגות'
  ]
  
  const suggestedConcepts: string[] = []
  for (const concept of courseConcepts) {
    if (text.includes(concept.toLowerCase())) {
      suggestedConcepts.push(concept)
    }
  }
  
  // If no concepts found, try to extract from context
  if (suggestedConcepts.length === 0) {
    // Look for patterns like "תודעה", "מעגל", etc.
    if (text.includes('תודעה')) {
      if (text.includes('ראקטיבית') || text.includes('reacting')) {
        suggestedConcepts.push('תודעה ראקטיבית')
      } else if (text.includes('אקטיבית') || text.includes('acting')) {
        suggestedConcepts.push('תודעה אקטיבית')
      } else if (text.includes('יצירתית') || text.includes('creating')) {
        suggestedConcepts.push('תודעה יצירתית')
      } else {
        suggestedConcepts.push('תודעה')
      }
    }
    
    if (text.includes('מעגל') && text.includes('תודעה')) {
      suggestedConcepts.push('מעגל התודעה')
    }
  }
  
  return {
    id: chunk.id,
    text: chunk.text,
    metadata,
    source: chunk.source || '',
    isGeneral,
    suggestedTopic,
    suggestedConcepts: suggestedConcepts.slice(0, 5)
  }
}

/**
 * Update chunk metadata in database
 */
async function updateChunkMetadata(analysis: ChunkAnalysis) {
  const updatedMetadata = {
    ...analysis.metadata,
    topic: analysis.suggestedTopic,
    key_concepts: analysis.suggestedConcepts,
    is_general: analysis.isGeneral,
    updated_at: new Date().toISOString()
  }
  
  await prisma.$executeRawUnsafe(
    `UPDATE knowledge_chunks 
     SET metadata = $1::jsonb
     WHERE id = $2`,
    JSON.stringify(updatedMetadata),
    analysis.id
  )
}

async function main() {
  console.log('🔍 Analyzing and improving chunk metadata...')
  console.log('='.repeat(80))
  
  // Get chunks that appear in many questions (from quality report)
  const problematicChunkIds = [
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 2_פרק 2 - תימלול - אימפקט אונליין_chunk_015',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 10_פרק 10 - תימלול - אימפקט אונליין_chunk_037',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 4_פרק 4 - תימלול - אימפקט אונליין_chunk_028',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 5 (1)_פרק 5 - תימלול - אימפקט אונליין_chunk_028',
    'lesson1_chunk_008',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 1_מדריך למידה_chunk_007',
    'פודקאסט_פרקים בקבוצות של 10_51_54_plus_extra_chunk_041',
    'פודקאסט_פרקים 1-54 + מון בלאן + הרדיו החברתי _chunk_1149',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 1_שאלות ותשובות_chunk_004',
    'פודקאסט_פרקים 1-54 + מון בלאן + הרדיו החברתי _chunk_126'
  ]
  
  console.log(`\n📋 Analyzing ${problematicChunkIds.length} problematic chunks...\n`)
  
  const analyses: ChunkAnalysis[] = []
  
  for (const chunkId of problematicChunkIds) {
    try {
      const chunks = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, text, metadata, source 
         FROM knowledge_chunks 
         WHERE id = $1`,
        chunkId
      )
      
      if (chunks.length > 0) {
        const chunk = chunks[0]
        const analysis = analyzeChunk(chunk)
        analyses.push(analysis)
        
        console.log(`\n📄 ${chunkId}`)
        console.log(`   Is General: ${analysis.isGeneral ? '⚠️  YES' : '✅ NO'}`)
        console.log(`   Suggested Topic: ${analysis.suggestedTopic.substring(0, 80)}...`)
        console.log(`   Suggested Concepts: ${analysis.suggestedConcepts.join(', ') || 'None'}`)
      }
    } catch (error) {
      console.error(`   ❌ Error analyzing ${chunkId}:`, error)
    }
  }
  
  console.log(`\n\n💾 Updating metadata for ${analyses.length} chunks...`)
  
  let updated = 0
  for (const analysis of analyses) {
    try {
      await updateChunkMetadata(analysis)
      updated++
      console.log(`   ✅ Updated: ${analysis.id}`)
    } catch (error) {
      console.error(`   ❌ Error updating ${analysis.id}:`, error)
    }
  }
  
  console.log(`\n✅ Updated ${updated}/${analyses.length} chunks`)
  console.log('='.repeat(80))
  
  await prisma.$disconnect()
}

main().catch(console.error)

