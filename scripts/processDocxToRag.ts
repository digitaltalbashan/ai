// Script to process DOCX file and convert to RAG JSONL format
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import mammoth from 'mammoth'

interface ChunkData {
  id: string
  text: string
  summary?: string
  metadata: {
    lesson?: number
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

/**
 * Clean text from transcription artifacts
 */
function cleanText(text: string): string {
  let cleaned = text

  // Remove excessive filler words
  cleaned = cleaned.replace(/\b(אמ|א|אז|ו|ה|ל)\s+/g, '')
  
  // Remove repeated words
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/g, '$1')
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ')
  
  // Clean up line breaks
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  return cleaned.trim()
}

/**
 * Split text into chunks of optimal size (1000-2000 characters)
 */
function splitIntoChunks(text: string, maxLength: number = 1500): string[] {
  const chunks: string[] = []
  let currentText = text

  while (currentText.length > maxLength) {
    // Try to split at sentence boundary
    let splitPoint = currentText.lastIndexOf('.', maxLength)
    if (splitPoint === -1) {
      splitPoint = currentText.lastIndexOf(' ', maxLength)
    }
    if (splitPoint === -1 || splitPoint < maxLength * 0.7) {
      splitPoint = maxLength
    }

    const chunkText = currentText.substring(0, splitPoint).trim()
    if (chunkText.length > 0) {
      chunks.push(chunkText)
    }
    currentText = currentText.substring(splitPoint).trim()
  }

  if (currentText.length > 0) {
    chunks.push(currentText)
  }

  return chunks
}

/**
 * Extract key concepts from text
 */
function extractKeyConcepts(text: string): string[] {
  const concepts: string[] = []
  const textLower = text.toLowerCase()
  
  const importantTerms = [
    'מעגל התודעה',
    'תודעה ראקטיבית',
    'תודעה אקטיבית',
    'תודעה יצירתית',
    'תת מודע',
    'רצון חופשי',
    'פחד',
    'מציאות',
    'שחיקה',
    'תקיעות',
    'מנהיגות תודעתית',
    'התנהגות',
    'רגש',
    'אסטרטגיה'
  ]
  
  for (const term of importantTerms) {
    if (textLower.includes(term.toLowerCase())) {
      concepts.push(term)
    }
  }
  
  return concepts
}

/**
 * Extract topic from text (first sentence or key phrase)
 */
function extractTopic(text: string, title?: string): string {
  if (title && title.trim().length > 0) {
    // Try to extract topic from title
    const titleWords = title.split(' ').slice(0, 5).join(' ')
    if (titleWords.length > 10) {
      return titleWords
    }
  }
  
  // Extract from first sentence or first meaningful phrase
  const sentences = text.split(/[.!?]\s+/).filter(s => s.trim().length > 10)
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim()
    // Remove common prefixes
    const cleaned = firstSentence
      .replace(/^(שלום|אני|זה|כך|כלומר|כלומר|אז|א|אמ)\s+/i, '')
      .trim()
    
    if (cleaned.length > 10 && cleaned.length < 100) {
      return cleaned
    }
    if (cleaned.length >= 100) {
      return cleaned.substring(0, 80).trim() + '...'
    }
  }
  
  // Fallback: use first 50 characters
  const fallback = text.substring(0, 50).trim()
  return fallback.replace(/^(שלום|אני|זה|כך|כלומר|אז|א|אמ)\s+/i, '').trim() || 'חלק מהקורס'
}

/**
 * Generate summary (first 200 characters)
 */
function generateSummary(text: string): string {
  const summary = text.substring(0, Math.min(text.length, 200)).trim()
  if (text.length > 200) {
    return summary + '...'
  }
  return summary
}

async function main() {
  const inputPath = join(process.cwd(), 'data', 'rag', 'טקסט קורס דיגיטלי מה שמואר עברית (1).docx')
  const outputPath = join(process.cwd(), 'data', 'rag', 'course_digital_rag.jsonl')

  console.log('🚀 Processing DOCX file to RAG format...')
  console.log('='.repeat(80))
  console.log(`📖 Input: ${inputPath}`)
  console.log(`📝 Output: ${outputPath}\n`)

  try {
    // Read DOCX file
    console.log('📄 Reading DOCX file...')
    const buffer = await readFile(inputPath)
    
    // Extract text from DOCX
    console.log('🔍 Extracting text from DOCX...')
    const result = await mammoth.extractRawText({ buffer })
    const fullText = result.value
    
    if (!fullText || fullText.trim().length === 0) {
      throw new Error('No text extracted from DOCX file')
    }
    
    console.log(`✅ Extracted ${fullText.length} characters`)
    
    // Clean text
    console.log('\n🧹 Cleaning text...')
    const cleanedText = cleanText(fullText)
    console.log(`✅ Cleaned text (${cleanedText.length} characters)`)
    
    // Split into chunks
    console.log('\n✂️  Splitting into chunks...')
    const textChunks = splitIntoChunks(cleanedText, 1500)
    console.log(`✅ Created ${textChunks.length} chunks`)
    
    // Process chunks
    console.log('\n📝 Processing chunks...')
    const processedChunks: ChunkData[] = []
    
    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i]
      const chunkId = `course_digital_chunk_${(i + 1).toString().padStart(3, '0')}`
      
      // Extract metadata
      const keyConcepts = extractKeyConcepts(chunkText)
      const topic = extractTopic(chunkText)
      const summary = generateSummary(chunkText)
      const wordCount = chunkText.split(/\s+/).filter(Boolean).length
      
      const chunk: ChunkData = {
        id: chunkId,
        text: chunkText,
        summary,
        metadata: {
          lesson: 1, // Can be updated based on content
          source: 'טקסט קורס דיגיטלי מה שמואר עברית (1).docx',
          order: i + 1,
          title: topic,
          language: 'he',
          tags: ['קורס דיגיטלי', 'מנהיגות תודעתית'],
          topic,
          key_concepts: keyConcepts,
          word_count: wordCount,
          is_standalone: wordCount > 100
        }
      }
      
      processedChunks.push(chunk)
      
      if ((i + 1) % 10 === 0) {
        console.log(`   Processed ${i + 1}/${textChunks.length} chunks...`)
      }
    }
    
    console.log(`✅ Processed ${processedChunks.length} chunks`)
    
    // Write to JSONL file
    console.log('\n💾 Writing to JSONL file...')
    const jsonlContent = processedChunks
      .map(chunk => JSON.stringify(chunk, null, 0))
      .join('\n')
    
    await writeFile(outputPath, jsonlContent, 'utf-8')
    console.log(`✅ Written to: ${outputPath}`)
    
    // Statistics
    console.log('\n' + '='.repeat(80))
    console.log('📊 Statistics:')
    console.log('='.repeat(80))
    console.log(`Total chunks: ${processedChunks.length}`)
    console.log(`Average chunk length: ${Math.round(processedChunks.reduce((sum, c) => sum + c.text.length, 0) / processedChunks.length)} characters`)
    console.log(`Chunks with key concepts: ${processedChunks.filter(c => c.metadata.key_concepts && c.metadata.key_concepts.length > 0).length}`)
    console.log(`Chunks with topic: ${processedChunks.filter(c => c.metadata.topic).length}`)
    console.log(`Chunks with summary: ${processedChunks.filter(c => c.summary).length}`)
    
    // Show sample chunks
    console.log('\n📋 Sample chunks:')
    processedChunks.slice(0, 3).forEach((chunk, idx) => {
      console.log(`\n[${idx + 1}] ${chunk.id}`)
      console.log(`   Topic: ${chunk.metadata.topic}`)
      console.log(`   Concepts: ${chunk.metadata.key_concepts?.join(', ') || 'none'}`)
      console.log(`   Length: ${chunk.text.length} characters`)
      console.log(`   Preview: ${chunk.text.substring(0, 100)}...`)
    })
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Processing complete!')
    console.log(`\n💡 Next steps:`)
    console.log(`   1. Review the output file: ${outputPath}`)
    console.log(`   2. Run: pnpm rag:index:digital (after creating the script)`)
    console.log(`   3. Test the RAG with queries`)
    
  } catch (error) {
    console.error('❌ Error processing DOCX file:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Stack trace:', error.stack)
    }
    process.exit(1)
  }
}

main().catch(console.error)

