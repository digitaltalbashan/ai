// Script to rebuild RAG index with improved chunking and update database
import { readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface ImprovedChunk {
  id: string
  text: string
  metadata: {
    source: string
    order: number
    topic?: string
    key_concepts?: string[]
    word_count: number
    token_count: number
    is_standalone: boolean
    chunk_type?: 'intro' | 'content' | 'summary' | 'general'
  }
}

/**
 * Estimate tokens (rough: 1 token ≈ 4 characters for Hebrew)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Context-aware chunking with sentence boundaries
 */
function contextAwareChunk(
  text: string,
  maxTokens: number = 300,
  overlapTokens: number = 75,
  minChunkTokens: number = 50
): Array<{ text: string; startIdx: number; endIdx: number; tokens: number }> {
  const chunks: Array<{ text: string; startIdx: number; endIdx: number; tokens: number }> = []
  
  // Split into sentences (Hebrew sentence endings)
  const sentenceEndings = /[.!?]\s+/
  const sentences = text.split(sentenceEndings).filter(s => s.trim().length > 0)
  
  if (sentences.length === 0) {
    return chunks
  }
  
  let currentChunk: string[] = []
  let currentTokens = 0
  let chunkStartIdx = 0
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim()
    if (!sentence) continue
    
    const sentenceTokens = estimateTokens(sentence)
    
    // If adding this sentence would exceed max_tokens, finalize current chunk
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      const chunkText = currentChunk.join('. ')
      const chunkTokens = estimateTokens(chunkText)
      
      if (chunkTokens >= minChunkTokens) {
        chunks.push({
          text: chunkText,
          startIdx: chunkStartIdx,
          endIdx: i - 1,
          tokens: chunkTokens
        })
      }
      
      // Start new chunk with overlap
      const overlapSentences: string[] = []
      let overlapTokensCount = 0
      
      // Take last few sentences for overlap
      for (let j = currentChunk.length - 1; j >= 0; j--) {
        const sent = currentChunk[j]
        const sentTokens = estimateTokens(sent)
        if (overlapTokensCount + sentTokens <= overlapTokens) {
          overlapSentences.unshift(sent)
          overlapTokensCount += sentTokens
        } else {
          break
        }
      }
      
      currentChunk = [...overlapSentences, sentence]
      currentTokens = overlapTokensCount + sentenceTokens
      chunkStartIdx = i - overlapSentences.length
    } else {
      currentChunk.push(sentence)
      currentTokens += sentenceTokens
    }
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join('. ')
    const chunkTokens = estimateTokens(chunkText)
    
    if (chunkTokens >= minChunkTokens) {
      chunks.push({
        text: chunkText,
        startIdx: chunkStartIdx,
        endIdx: sentences.length - 1,
        tokens: chunkTokens
      })
    }
  }
  
  return chunks
}

/**
 * Analyze chunk to determine type and extract metadata
 */
function analyzeChunk(chunkText: string, source: string): ImprovedChunk['metadata'] {
  const text = chunkText.toLowerCase()
  const words = chunkText.split(/\s+/).filter(Boolean)
  
  // Determine chunk type
  let chunkType: 'intro' | 'content' | 'summary' | 'general' = 'content'
  
  if (text.includes('שלום') || text.includes('ברוכים') || text.includes('נתחיל')) {
    chunkType = 'intro'
  } else if (text.includes('סיכום') || text.includes('לסיכום') || text.includes('בסוף')) {
    chunkType = 'summary'
  } else {
    // Check if chunk is too general
    const commonWords = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם']
    const commonWordCount = words.filter(w => commonWords.includes(w.toLowerCase())).length
    if (commonWordCount > words.length * 0.3) {
      chunkType = 'general'
    }
  }
  
  // Extract topic (first meaningful sentence)
  const sentences = chunkText.split(/[.!?]\s+/).filter(s => s.length > 20)
  const topic = sentences.length > 0 ? sentences[0].substring(0, 100).trim() : ''
  
  // Extract key concepts
  const courseConcepts = [
    'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
    'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
    'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות'
  ]
  
  const keyConcepts: string[] = []
  for (const concept of courseConcepts) {
    if (text.includes(concept.toLowerCase())) {
      keyConcepts.push(concept)
    }
  }
  
  return {
    source,
    order: 0, // Will be set later
    topic: topic || undefined,
    key_concepts: keyConcepts.length > 0 ? keyConcepts.slice(0, 5) : undefined,
    word_count: words.length,
    token_count: estimateTokens(chunkText),
    is_standalone: words.length > 100,
    chunk_type: chunkType
  }
}

/**
 * Process a single JSONL file and re-chunk it
 */
async function processJsonlFile(filePath: string): Promise<ImprovedChunk[]> {
  const content = await readFile(filePath, 'utf-8')
  const lines = content.trim().split('\n').filter(l => l.trim())
  
  const allChunks: ImprovedChunk[] = []
  
  for (const line of lines) {
    try {
      const oldChunk = JSON.parse(line)
      const source = oldChunk.metadata?.source || filePath.split('/').pop() || 'unknown'
      
      // Re-chunk with improved method
      const newChunks = contextAwareChunk(oldChunk.text, 300, 75, 50)
      
      for (let i = 0; i < newChunks.length; i++) {
        const chunkData = newChunks[i]
        const metadata = analyzeChunk(chunkData.text, source)
        metadata.order = i + 1
        
        // Generate new ID
        const baseId = oldChunk.id.split('_chunk_')[0] || oldChunk.id
        const newId = `${baseId}_improved_chunk_${(i + 1).toString().padStart(3, '0')}`
        
        allChunks.push({
          id: newId,
          text: chunkData.text,
          metadata
        })
      }
    } catch (error) {
      console.error(`Error processing line in ${filePath}:`, error)
    }
  }
  
  return allChunks
}

/**
 * Index improved chunks to database
 */
async function indexChunks(chunks: ImprovedChunk[]) {
  console.log(`\n💾 Indexing ${chunks.length} improved chunks to database...`)
  
  let indexed = 0
  let errors = 0
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    
    if ((i + 1) % 100 === 0) {
      console.log(`   Progress: ${i + 1}/${chunks.length} (${((i + 1) / chunks.length * 100).toFixed(1)}%)`)
    }
    
    try {
      // Generate embedding
      const embedding = await embedText(chunk.text)
      const embeddingStr = `[${embedding.join(',')}]`
      
      // Upsert to database
      await prisma.$executeRawUnsafe(
        `INSERT INTO knowledge_chunks (id, text, metadata, source, embedding)
         VALUES ($1, $2, $3::jsonb, $4, $5::vector)
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text,
           metadata = EXCLUDED.metadata,
           source = EXCLUDED.source,
           embedding = EXCLUDED.embedding`,
        chunk.id,
        chunk.text,
        JSON.stringify(chunk.metadata),
        chunk.metadata.source,
        embeddingStr
      )
      
      indexed++
    } catch (error) {
      errors++
      console.error(`   ❌ Error indexing ${chunk.id}:`, error)
    }
  }
  
  console.log(`\n✅ Indexed: ${indexed}/${chunks.length}`)
  console.log(`❌ Errors: ${errors}`)
}

async function main() {
  console.log('🚀 Rebuilding RAG index with improved chunking...')
  console.log('='.repeat(80))
  
  const ragDir = join(process.cwd(), 'data', 'rag')
  const files = await readdir(ragDir)
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('backup'))
  
  console.log(`\n📁 Found ${jsonlFiles.length} JSONL files`)
  console.log(`\n📝 Processing files with improved chunking...`)
  
  const allChunks: ImprovedChunk[] = []
  
  for (let i = 0; i < jsonlFiles.length; i++) {
    const file = jsonlFiles[i]
    const filePath = join(ragDir, file)
    
    console.log(`\n[${i + 1}/${jsonlFiles.length}] Processing: ${file}`)
    
    try {
      const chunks = await processJsonlFile(filePath)
      allChunks.push(...chunks)
      console.log(`   ✅ Created ${chunks.length} improved chunks`)
    } catch (error) {
      console.error(`   ❌ Error processing ${file}:`, error)
    }
  }
  
  console.log(`\n✅ Total improved chunks: ${allChunks.length}`)
  
  // Index to database
  await indexChunks(allChunks)
  
  console.log('\n' + '='.repeat(80))
  console.log('✨ Rebuild complete!')
  console.log('='.repeat(80))
  
  await prisma.$disconnect()
}

main().catch(console.error)

