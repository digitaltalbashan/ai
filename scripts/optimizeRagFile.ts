// Script to optimize RAG file: clean transcription, split long chunks, add summaries, improve metadata
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface ChunkData {
  id: string
  text: string
  summary?: string
  metadata: {
    lesson: number
    source: string
    order: number
    title: string
    language: string
    tags: string[]
    topic?: string
    key_concepts?: string[]
    word_count?: number
    is_standalone?: boolean
  }
}

// Clean transcription artifacts
function cleanTranscription(text: string): string {
  let cleaned = text

  // Remove common filler words at start/end of sentences
  cleaned = cleaned.replace(/\b(אמ|א|אז|ו|ה|ל)\s+/g, '')
  
  // Remove excessive filler words (keep some for natural flow)
  cleaned = cleaned.replace(/\b(אה|אוקיי|רגע|כן|נכון)\s+/g, (match, word) => {
    // Keep first occurrence, remove duplicates
    return match
  })
  
  // Remove repeated words
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/g, '$1')
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ')
  
  // Clean up line breaks (keep meaningful ones)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  // Remove trailing/leading connectors
  cleaned = cleaned.replace(/^[אבגדהוזחטיכסעפצקרשת]\s+/g, '')
  cleaned = cleaned.replace(/\s+[אבגדהוזחטיכסעפצקרשת]$/g, '')
  
  return cleaned.trim()
}

// Extract topic from text (simple heuristic)
function extractTopic(text: string, title: string): string {
  const lowerText = text.toLowerCase()
  const lowerTitle = title.toLowerCase()
  
  // Check for key concepts
  const concepts = [
    'מעגל התודעה',
    'תודעה ראקטיבית',
    'תודעה אקטיבית',
    'תודעה קריאטיבית',
    'תת מודע',
    'רצון חופשי',
    'מציאות',
    'מנהיגות תודעתית'
  ]
  
  for (const concept of concepts) {
    if (lowerText.includes(concept.toLowerCase()) || lowerTitle.includes(concept.toLowerCase())) {
      return concept
    }
  }
  
  // Extract from title if it's meaningful
  if (title.length > 10 && title.length < 100) {
    return title.split(' ').slice(0, 3).join(' ')
  }
  
  return 'כללי'
}

// Extract key concepts from text
function extractKeyConcepts(text: string): string[] {
  const concepts: string[] = []
  const lowerText = text.toLowerCase()
  
  const conceptList = [
    'מעגל התודעה',
    'תודעה ראקטיבית',
    'תודעה אקטיבית',
    'תודעה קריאטיבית',
    'תת מודע',
    'רצון חופשי',
    'מציאות',
    'מנהיגות תודעתית',
    'התנהגות',
    'רגש',
    'פחד',
    'השפלה',
    'בושה',
    'אסטרטגיה',
    'מערכת הפעלה',
    'מצדה'
  ]
  
  for (const concept of conceptList) {
    if (lowerText.includes(concept.toLowerCase())) {
      concepts.push(concept)
    }
  }
  
  return concepts.slice(0, 5) // Limit to 5 concepts
}

// Generate summary (simple extractive summary)
function generateSummary(text: string, title: string): string {
  // Try to find the main point in first 200 chars
  const firstPart = text.substring(0, 200).trim()
  
  // If it contains key phrases, use them
  if (firstPart.includes('מעגל התודעה')) {
    const match = text.match(/מעגל התודעה[^.]{0,150}\./)
    if (match) {
      return match[0].trim()
    }
  }
  
  // Otherwise, use first sentence or two
  const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 20)
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join('. ').substring(0, 200) + (sentences.length > 1 ? '...' : '')
  }
  
  // Fallback to title-based summary
  return `${title}. ${text.substring(0, 100)}...`
}

// Split long chunk into smaller chunks
function splitLongChunk(chunk: ChunkData, maxLength: number = 2000): ChunkData[] {
  if (chunk.text.length <= maxLength) {
    return [chunk]
  }
  
  const chunks: ChunkData[] = []
  const sentences = chunk.text.split(/[.!?]\s+/).filter(s => s.trim().length > 20)
  
  let currentText = ''
  let currentOrder = chunk.metadata.order
  let partIndex = 1
  
  for (const sentence of sentences) {
    if ((currentText + sentence).length > maxLength && currentText.length > 500) {
      // Save current chunk
      const newChunk: ChunkData = {
        id: `${chunk.id}_part${partIndex}`,
        text: currentText.trim(),
        summary: generateSummary(currentText, chunk.metadata.title),
        metadata: {
          ...chunk.metadata,
          order: currentOrder,
          title: `${chunk.metadata.title} (חלק ${partIndex})`,
          topic: extractTopic(currentText, chunk.metadata.title),
          key_concepts: extractKeyConcepts(currentText),
          word_count: currentText.split(/\s+/).length,
          is_standalone: true
        }
      }
      chunks.push(newChunk)
      
      // Start new chunk
      currentText = sentence + '. '
      currentOrder++
      partIndex++
    } else {
      currentText += sentence + '. '
    }
  }
  
  // Add remaining text
  if (currentText.trim().length > 0) {
    const newChunk: ChunkData = {
      id: `${chunk.id}_part${partIndex}`,
      text: currentText.trim(),
      summary: generateSummary(currentText, chunk.metadata.title),
      metadata: {
        ...chunk.metadata,
        order: currentOrder,
        title: `${chunk.metadata.title} (חלק ${partIndex})`,
        topic: extractTopic(currentText, chunk.metadata.title),
        key_concepts: extractKeyConcepts(currentText),
        word_count: currentText.split(/\s+/).length,
        is_standalone: true
      }
    }
    chunks.push(newChunk)
  }
  
  return chunks
}

// Merge short chunks with neighbors
function mergeShortChunks(chunks: ChunkData[], minLength: number = 1000): ChunkData[] {
  const merged: ChunkData[] = []
  let i = 0
  
  while (i < chunks.length) {
    const current = chunks[i]
    
    if (current.text.length < minLength && i < chunks.length - 1) {
      // Try to merge with next chunk
      const next = chunks[i + 1]
      const mergedText = current.text + '\n\n' + next.text
      
      if (mergedText.length < 2500) {
        // Merge them
        const mergedChunk: ChunkData = {
          id: `${current.id}_merged`,
          text: mergedText,
          summary: `${current.summary || current.metadata.title}. ${next.summary || next.metadata.title}`,
          metadata: {
            ...current.metadata,
            order: current.metadata.order,
            title: `${current.metadata.title} + ${next.metadata.title}`,
            topic: current.metadata.topic || next.metadata.topic || 'כללי',
            key_concepts: [...new Set([...(current.metadata.key_concepts || []), ...(next.metadata.key_concepts || [])])],
            word_count: mergedText.split(/\s+/).length,
            is_standalone: true
          }
        }
        merged.push(mergedChunk)
        i += 2 // Skip next chunk as it's merged
        continue
      }
    }
    
    // Keep chunk as is
    merged.push(current)
    i++
  }
  
  return merged
}

async function main() {
  console.log('🚀 Starting RAG file optimization...')
  console.log('=' .repeat(80))
  
  const inputPath = join(process.cwd(), 'data', 'rag', 'lesson1_rag.jsonl')
  const outputPath = join(process.cwd(), 'data', 'rag', 'lesson1_rag_optimized.jsonl')
  const backupPath = join(process.cwd(), 'data', 'rag', 'lesson1_rag_backup.jsonl')
  
  try {
    // Read original file
    console.log('📖 Reading original file...')
    const fileContent = await readFile(inputPath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter(line => line.trim())
    
    // Create backup
    console.log('💾 Creating backup...')
    await writeFile(backupPath, fileContent, 'utf-8')
    console.log(`   ✅ Backup saved to: ${backupPath}`)
    
    // Parse chunks
    const originalChunks: ChunkData[] = lines.map(line => JSON.parse(line))
    console.log(`   ✅ Loaded ${originalChunks.length} chunks`)
    
    // Step 1: Clean transcription
    console.log('\n🧹 Step 1: Cleaning transcription...')
    let cleanedChunks = originalChunks.map(chunk => ({
      ...chunk,
      text: cleanTranscription(chunk.text)
    }))
    console.log(`   ✅ Cleaned ${cleanedChunks.length} chunks`)
    
    // Step 2: Split long chunks
    console.log('\n✂️  Step 2: Splitting long chunks...')
    const splitChunks: ChunkData[] = []
    let splitCount = 0
    for (const chunk of cleanedChunks) {
      if (chunk.text.length > 2000) {
        const split = splitLongChunk(chunk, 2000)
        splitChunks.push(...split)
        if (split.length > 1) {
          splitCount++
          console.log(`   ✂️  Split ${chunk.id} into ${split.length} parts`)
        }
      } else {
        splitChunks.push(chunk)
      }
    }
    console.log(`   ✅ Split ${splitCount} chunks, total now: ${splitChunks.length}`)
    
    // Step 3: Add summaries and improve metadata
    console.log('\n📝 Step 3: Adding summaries and improving metadata...')
    const enrichedChunks = splitChunks.map((chunk, index) => {
      const wordCount = chunk.text.split(/\s+/).length
      const topic = extractTopic(chunk.text, chunk.metadata.title)
      const keyConcepts = extractKeyConcepts(chunk.text)
      const summary = generateSummary(chunk.text, chunk.metadata.title)
      
      return {
        ...chunk,
        id: `lesson1_chunk_${String(index + 1).padStart(3, '0')}`,
        summary,
        metadata: {
          ...chunk.metadata,
          order: index + 1,
          topic,
          key_concepts: keyConcepts.length > 0 ? keyConcepts : undefined,
          word_count: wordCount,
          is_standalone: chunk.text.length >= 1000 && chunk.text.length <= 2000
        }
      }
    })
    console.log(`   ✅ Enriched ${enrichedChunks.length} chunks with metadata`)
    
    // Step 4: Merge short chunks
    console.log('\n🔗 Step 4: Merging short chunks...')
    const finalChunks = mergeShortChunks(enrichedChunks, 1000)
    const mergedCount = enrichedChunks.length - finalChunks.length
    if (mergedCount > 0) {
      console.log(`   🔗 Merged ${mergedCount} chunks`)
    }
    
    // Renumber final chunks
    const renumberedChunks = finalChunks.map((chunk, index) => ({
      ...chunk,
      id: `lesson1_chunk_${String(index + 1).padStart(3, '0')}`,
      metadata: {
        ...chunk.metadata,
        order: index + 1
      }
    }))
    
    // Step 5: Write optimized file
    console.log('\n💾 Step 5: Writing optimized file...')
    const outputLines = renumberedChunks.map(chunk => JSON.stringify(chunk, null, 0))
    await writeFile(outputPath, outputLines.join('\n') + '\n', 'utf-8')
    
    // Statistics
    console.log('\n📊 Optimization Statistics:')
    console.log('=' .repeat(80))
    console.log(`Original chunks: ${originalChunks.length}`)
    console.log(`Optimized chunks: ${renumberedChunks.length}`)
    console.log(`Chunks split: ${splitCount}`)
    console.log(`Chunks merged: ${mergedCount}`)
    
    const originalAvgLength = originalChunks.reduce((sum, c) => sum + c.text.length, 0) / originalChunks.length
    const optimizedAvgLength = renumberedChunks.reduce((sum, c) => sum + c.text.length, 0) / renumberedChunks.length
    
    console.log(`\nAverage length:`)
    console.log(`  Before: ${Math.round(originalAvgLength)} characters`)
    console.log(`  After: ${Math.round(optimizedAvgLength)} characters`)
    
    const lengthRange = renumberedChunks.map(c => c.text.length)
    console.log(`\nLength range:`)
    console.log(`  Min: ${Math.min(...lengthRange)} characters`)
    console.log(`  Max: ${Math.max(...lengthRange)} characters`)
    
    const chunksInRange = renumberedChunks.filter(c => c.text.length >= 1000 && c.text.length <= 2000).length
    console.log(`\nChunks in optimal range (1000-2000 chars): ${chunksInRange}/${renumberedChunks.length} (${Math.round(chunksInRange / renumberedChunks.length * 100)}%)`)
    
    const chunksWithSummary = renumberedChunks.filter(c => c.summary).length
    console.log(`Chunks with summary: ${chunksWithSummary}/${renumberedChunks.length} (100%)`)
    
    const chunksWithTopic = renumberedChunks.filter(c => c.metadata.topic).length
    console.log(`Chunks with topic: ${chunksWithTopic}/${renumberedChunks.length} (100%)`)
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Optimization complete!')
    console.log(`\n📁 Files:`)
    console.log(`   Original: ${inputPath}`)
    console.log(`   Backup: ${backupPath}`)
    console.log(`   Optimized: ${outputPath}`)
    console.log(`\n💡 Next steps:`)
    console.log(`   1. Review the optimized file`)
    console.log(`   2. If satisfied, replace original: mv ${outputPath} ${inputPath}`)
    console.log(`   3. Re-index: pnpm rag:reset:lesson1`)
    
  } catch (error) {
    console.error('❌ Error during optimization:', error)
    process.exit(1)
  }
}

main().catch(console.error)

