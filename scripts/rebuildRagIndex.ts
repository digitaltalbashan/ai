// Script to rebuild RAG index with improved context-aware chunking
// This will process all JSONL files and create new chunks with better chunking
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
 * Improved context-aware chunking with sentence boundaries
 * Uses 200-400 tokens with 50-100 overlap as recommended
 */
function contextAwareChunk(
  text: string,
  maxTokens: number = 300,
  overlapTokens: number = 75,
  minChunkTokens: number = 50
): Array<{ text: string; tokens: number; startIdx: number; endIdx: number }> {
  const chunks: Array<{ text: string; tokens: number; startIdx: number; endIdx: number }> = []
  
  // Clean text - remove excessive whitespace
  const cleanedText = text.replace(/\s+/g, ' ').trim()
  
  // Split into sentences (Hebrew sentence endings)
  const sentenceEndings = /[.!?]\s+/
  const sentences = cleanedText.split(sentenceEndings)
    .map(s => s.trim())
    .filter(s => s.length > 10) // Filter very short sentences
  
  if (sentences.length === 0) {
    // Fallback: split by paragraphs or just use the text
    if (cleanedText.length > 0) {
      const tokens = estimateTokens(cleanedText)
      if (tokens >= minChunkTokens) {
        chunks.push({
          text: cleanedText,
          tokens,
          startIdx: 0,
          endIdx: 0
        })
      }
    }
    return chunks
  }
  
  let currentChunk: string[] = []
  let currentTokens = 0
  let chunkStartIdx = 0
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceTokens = estimateTokens(sentence)
    
    // If adding this sentence would exceed max_tokens, finalize current chunk
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      const chunkText = currentChunk.join('. ')
      const chunkTokens = estimateTokens(chunkText)
      
      if (chunkTokens >= minChunkTokens) {
        chunks.push({
          text: chunkText,
          tokens: chunkTokens,
          startIdx: chunkStartIdx,
          endIdx: i - 1
        })
      }
      
      // Start new chunk with overlap
      const overlapSentences: string[] = []
      let overlapTokensCount = 0
      
      // Take last few sentences for overlap (aim for overlapTokens)
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
        tokens: chunkTokens,
        startIdx: chunkStartIdx,
        endIdx: sentences.length - 1
      })
    }
  }
  
  return chunks
}

/**
 * Analyze chunk to extract metadata
 */
function analyzeChunk(chunkText: string, source: string, order: number): ImprovedChunk['metadata'] {
  const text = chunkText.toLowerCase()
  const words = chunkText.split(/\s+/).filter(Boolean)
  
  // Determine chunk type
  let chunkType: 'intro' | 'content' | 'summary' | 'general' = 'content'
  
  const introIndicators = ['שלום', 'ברוכים', 'נתחיל', 'היום', 'בשיעור', 'בפרק']
  const summaryIndicators = ['סיכום', 'לסיכום', 'בסוף', 'לסיום', 'לכן', 'לסיכום']
  
  if (introIndicators.some(ind => text.includes(ind)) && order <= 3) {
    chunkType = 'intro'
  } else if (summaryIndicators.some(ind => text.includes(ind))) {
    chunkType = 'summary'
  } else {
    // Check if chunk is too general
    const commonWords = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם', 'יותר']
    const commonWordCount = words.filter(w => commonWords.includes(w.toLowerCase())).length
    if (commonWordCount > words.length * 0.35) {
      chunkType = 'general'
    }
  }
  
  // Extract topic (first meaningful sentence)
  const sentences = chunkText.split(/[.!?]\s+/).filter(s => s.length > 20)
  let topic = ''
  if (sentences.length > 0) {
    // Take first sentence, but limit to 100 chars
    topic = sentences[0].substring(0, 100).trim()
    // If first sentence is too short, try second
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
  
  const keyConcepts: string[] = []
  for (const concept of courseConcepts) {
    if (text.includes(concept.toLowerCase())) {
      keyConcepts.push(concept)
      if (keyConcepts.length >= 5) break // Limit to 5
    }
  }
  
  return {
    source,
    order,
    topic: topic || undefined,
    key_concepts: keyConcepts.length > 0 ? keyConcepts : undefined,
    word_count: words.length,
    token_count: estimateTokens(chunkText),
    is_standalone: words.length > 100 && estimateTokens(chunkText) > 50,
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
      const originalText = oldChunk.text || ''
      
      if (!originalText || originalText.trim().length < 50) {
        continue // Skip very short chunks
      }
      
      // Re-chunk with improved method
      // Use 300 tokens max, 75 overlap (middle of recommended range)
      const newChunks = contextAwareChunk(originalText, 300, 75, 50)
      
      // If chunking didn't split (chunk was already good size), keep original
      if (newChunks.length === 0) {
        continue
      }
      
      // If only one chunk and it's similar size to original, might be fine
      // But we'll still process it to get better metadata
      const baseId = oldChunk.id.split('_chunk_')[0] || oldChunk.id.replace('_rag.jsonl', '')
      
      for (let i = 0; i < newChunks.length; i++) {
        const chunkData = newChunks[i]
        const metadata = analyzeChunk(chunkData.text, source, i + 1)
        
        // Generate new ID
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
 * Index improved chunks to database with optimized batching
 * Process sequentially to avoid memory issues
 */
async function indexChunks(chunks: ImprovedChunk[], batchSize: number = 10) {
  console.log(`\n💾 Indexing ${chunks.length} improved chunks to database...`)
  console.log(`   Using batch size: ${batchSize} (optimized for embedding generation)`)
  
  const startTime = process.hrtime.bigint()
  let indexed = 0
  let errors = 0
  
  // Process in smaller batches to avoid memory issues
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    // Show progress more frequently
    if ((i + 1) % batchSize === 0 || i === 0 || i === chunks.length - batchSize) {
      const percent = ((i + 1) / chunks.length * 100).toFixed(1)
      const elapsed = process.hrtime.bigint() - startTime
      const elapsedSeconds = Number(elapsed) / 1e9
      const rate = (i + 1) / elapsedSeconds
      const remaining = (chunks.length - (i + 1)) / rate
      const remainingMinutes = Math.floor(remaining / 60)
      const remainingSeconds = Math.floor(remaining % 60)
      
      console.log(`\n📊 Progress: ${i + 1}/${chunks.length} (${percent}%)`)
      console.log(`   ✅ Indexed: ${indexed}`)
      console.log(`   ⚡ Rate: ${rate.toFixed(1)} chunks/sec`)
      console.log(`   ⏱️  ETA: ${remainingMinutes}m ${remainingSeconds}s`)
      if (errors > 0) {
        console.log(`   ❌ Errors: ${errors}`)
      }
    }
    
    // Process batch sequentially to avoid memory issues
    for (const chunk of batch) {
      try {
        // Generate embedding
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`
        
        // Upsert to database
        await prisma.$executeRawUnsafe(
          `INSERT INTO knowledge_chunks (id, text, metadata, source, "order", embedding)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6::vector)
           ON CONFLICT (id) DO UPDATE SET
             text = EXCLUDED.text,
             metadata = EXCLUDED.metadata,
             source = EXCLUDED.source,
             "order" = EXCLUDED."order",
             embedding = EXCLUDED.embedding`,
          chunk.id,
          chunk.text,
          JSON.stringify(chunk.metadata),
          chunk.metadata.source,
          chunk.metadata.order,
          embeddingStr
        )
        
        indexed++
      } catch (error) {
        errors++
        if (errors <= 10) {
          console.error(`   ❌ Error indexing ${chunk.id}:`, error instanceof Error ? error.message : String(error).substring(0, 100))
        }
      }
    }
  }
  
  const totalTime = Number(process.hrtime.bigint() - startTime) / 1e9
  const avgRate = chunks.length / totalTime
  
  console.log(`\n` + '='.repeat(80))
  console.log(`✅ Indexing Complete!`)
  console.log('='.repeat(80))
  console.log(`📊 Statistics:`)
  console.log(`   Total chunks: ${chunks.length}`)
  console.log(`   ✅ Indexed: ${indexed}`)
  console.log(`   ❌ Errors: ${errors}`)
  console.log(`   ⏱️  Total time: ${Math.floor(totalTime / 60)}m ${Math.floor(totalTime % 60)}s`)
  console.log(`   ⚡ Average rate: ${avgRate.toFixed(2)} chunks/sec`)
  console.log('='.repeat(80))
}

async function main() {
  console.log('🚀 Rebuilding RAG index with improved context-aware chunking...')
  console.log('='.repeat(80))
  console.log('📋 Strategy:')
  console.log('  - Context-aware chunking: 200-400 tokens (using 300)')
  console.log('  - Overlap: 50-100 tokens (using 75)')
  console.log('  - Better metadata extraction')
  console.log('  - Chunk type classification')
  console.log('='.repeat(80))
  
  const ragDir = join(process.cwd(), 'data', 'rag')
  const files = await readdir(ragDir)
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('backup'))
  
  console.log(`\n📁 Found ${jsonlFiles.length} JSONL files`)
  console.log(`\n📝 Processing files with improved chunking...`)
  
  const allChunks: ImprovedChunk[] = []
  const fileStats: Array<{ file: string; original: number; improved: number }> = []
  
  for (let i = 0; i < jsonlFiles.length; i++) {
    const file = jsonlFiles[i]
    const filePath = join(ragDir, file)
    
    try {
      // Count original chunks
      const content = await readFile(filePath, 'utf-8')
      const originalCount = content.trim().split('\n').filter(l => l.trim()).length
      
      const chunks = await processJsonlFile(filePath)
      allChunks.push(...chunks)
      
      fileStats.push({
        file,
        original: originalCount,
        improved: chunks.length
      })
      
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`\n[${i + 1}/${jsonlFiles.length}] Processed: ${file}`)
        console.log(`   Original: ${originalCount} chunks → Improved: ${chunks.length} chunks`)
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${file}:`, error)
    }
  }
  
  // Statistics
  const totalOriginal = fileStats.reduce((sum, s) => sum + s.original, 0)
  const totalImproved = allChunks.length
  
  console.log(`\n` + '='.repeat(80))
  console.log('📊 Chunking Statistics:')
  console.log('='.repeat(80))
  console.log(`Total original chunks: ${totalOriginal}`)
  console.log(`Total improved chunks: ${totalImproved}`)
  console.log(`Change: ${totalImproved > totalOriginal ? '+' : ''}${totalImproved - totalOriginal} (${((totalImproved / totalOriginal - 1) * 100).toFixed(1)}%)`)
  
  // Show top files by change
  const topChanged = fileStats
    .sort((a, b) => Math.abs(b.improved - b.original) - Math.abs(a.improved - a.original))
    .slice(0, 10)
  
  console.log(`\n📋 Top 10 files by chunk change:`)
  topChanged.forEach((stat, i) => {
    const change = stat.improved - stat.original
    console.log(`   ${i + 1}. ${stat.file.substring(0, 50)}...`)
    console.log(`      ${stat.original} → ${stat.improved} (${change > 0 ? '+' : ''}${change})`)
  })
  
  // Index to database
  await indexChunks(allChunks, 50)
  
  console.log('\n' + '='.repeat(80))
  console.log('✨ Rebuild complete!')
  console.log('='.repeat(80))
  console.log(`\n📊 Final stats:`)
  console.log(`   Files processed: ${jsonlFiles.length}`)
  console.log(`   Improved chunks created: ${totalImproved}`)
  console.log(`   Ready for testing!`)
  
  await prisma.$disconnect()
}

main().catch(console.error)

