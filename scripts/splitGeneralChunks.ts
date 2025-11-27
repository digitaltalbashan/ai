// Script to split overly general chunks into smaller, more focused chunks
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

/**
 * Estimate tokens
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Split chunk into smaller, more focused chunks
 */
function splitChunk(text: string, maxTokens: number = 250): string[] {
  const chunks: string[] = []
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
  
  let currentChunk = ''
  let currentTokens = 0
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)
    
    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = para
      currentTokens = paraTokens
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
      currentTokens += paraTokens
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }
  
  // If still too large, split by sentences
  if (chunks.length === 1 && estimateTokens(chunks[0]) > maxTokens * 1.5) {
    const sentences = chunks[0].split(/[.!?]\s+/).filter(s => s.trim().length > 20)
    const newChunks: string[] = []
    let current = ''
    let tokens = 0
    
    for (const sent of sentences) {
      const sentTokens = estimateTokens(sent)
      if (tokens + sentTokens > maxTokens && current) {
        newChunks.push(current.trim())
        current = sent
        tokens = sentTokens
      } else {
        current += (current ? '. ' : '') + sent
        tokens += sentTokens
      }
    }
    
    if (current) {
      newChunks.push(current.trim())
    }
    
    return newChunks.length > 1 ? newChunks : chunks
  }
  
  return chunks
}

async function main() {
  console.log('🔍 Finding and splitting overly general chunks...')
  console.log('='.repeat(80))
  
  // Get chunks that appear in many questions (from quality report)
  const problematicChunkIds = [
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 2_פרק 2 - תימלול - אימפקט אונליין_chunk_015',
    'אימפקט אונליין - מחזור מרץ 2025_שיעור 10_פרק 10 - תימלול - אימפקט אונליין_chunk_037'
  ]
  
  console.log(`\n📋 Processing ${problematicChunkIds.length} problematic chunks...\n`)
  
  for (const chunkId of problematicChunkIds) {
    try {
      const chunks = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, text, metadata, source 
         FROM knowledge_chunks 
         WHERE id = $1`,
        chunkId
      )
      
      if (chunks.length === 0) {
        console.log(`⚠️  Chunk not found: ${chunkId}`)
        continue
      }
      
      const chunk = chunks[0]
      const originalText = chunk.text
      const originalTokens = estimateTokens(originalText)
      
      console.log(`\n📄 ${chunkId}`)
      console.log(`   Original: ${originalText.length} chars, ~${originalTokens} tokens`)
      
      // Split chunk
      const newChunks = splitChunk(originalText, 250)
      
      if (newChunks.length <= 1) {
        console.log(`   ✅ Chunk is already appropriately sized`)
        continue
      }
      
      console.log(`   ✂️  Split into ${newChunks.length} chunks`)
      
      // Delete original chunk
      await prisma.$executeRawUnsafe(
        `DELETE FROM knowledge_chunks WHERE id = $1`,
        chunkId
      )
      console.log(`   🗑️  Deleted original chunk`)
      
      // Create new chunks
      const baseId = chunkId.replace(/_chunk_\d+$/, '')
      let created = 0
      
      for (let i = 0; i < newChunks.length; i++) {
        const newChunkText = newChunks[i]
        const newChunkId = `${baseId}_chunk_${(i + 1).toString().padStart(3, '0')}`
        
        // Generate embedding
        const embedding = await embedText(newChunkText)
        const embeddingStr = `[${embedding.join(',')}]`
        
        // Update metadata
        const metadata = {
          ...chunk.metadata,
          order: i + 1,
          word_count: newChunkText.split(/\s+/).length,
          token_count: estimateTokens(newChunkText),
          is_standalone: estimateTokens(newChunkText) > 50,
          split_from: chunkId,
          split_index: i + 1,
          total_splits: newChunks.length
        }
        
        // Insert new chunk
        await prisma.$executeRawUnsafe(
          `INSERT INTO knowledge_chunks (id, text, metadata, source, embedding)
           VALUES ($1, $2, $3::jsonb, $4, $5::vector)`,
          newChunkId,
          newChunkText,
          JSON.stringify(metadata),
          chunk.source,
          embeddingStr
        )
        
        created++
      }
      
      console.log(`   ✅ Created ${created} new chunks`)
      
    } catch (error) {
      console.error(`   ❌ Error processing ${chunkId}:`, error)
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('✨ Split complete!')
  console.log('='.repeat(80))
  
  await prisma.$disconnect()
}

main().catch(console.error)

