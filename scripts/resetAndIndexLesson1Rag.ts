// Script to reset and re-index lesson 1 RAG chunks
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface ChunkData {
  id: string
  text: string
  metadata?: {
    lesson?: number
    source?: string
    order?: number
    title?: string
    language?: string
    tags?: string[]
  }
  source?: string
  lesson?: number | string
  order?: number
  tags?: string[]
}

async function main() {
  console.log('🔄 Reset and Re-index Lesson 1 RAG')
  console.log('='.repeat(80))
  
  try {
    // Step 1: Delete existing lesson 1 chunks
    console.log('\n📋 Step 1: Deleting existing lesson 1 chunks...')
    
    // Delete by ID pattern (lesson1_%)
    const deleteResult = await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_chunks WHERE id LIKE 'lesson1_%'`
    )
    
    console.log(`✅ Deleted existing lesson 1 chunks (affected rows: ${deleteResult})`)
    
    // Step 2: Read the JSONL file
    const filePath = join(process.cwd(), 'data', 'rag', 'lesson1_rag.jsonl')
    console.log(`\n📚 Step 2: Reading JSONL file: ${filePath}`)
    
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())
    
    if (lines.length === 0) {
      console.error('❌ No lines found in file')
      process.exit(1)
    }
    
    console.log(`📄 Found ${lines.length} lines to parse`)
    
    // Step 3: Parse chunks
    console.log('\n🔍 Step 3: Parsing chunks...')
    const chunks: ChunkData[] = []
    
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i])
        
        // Normalize the chunk data structure
        const chunk: ChunkData = {
          id: parsed.id,
          text: parsed.text,
          metadata: parsed.metadata || {},
          source: parsed.metadata?.source || parsed.source,
          lesson: parsed.metadata?.lesson || parsed.lesson,
          order: parsed.metadata?.order || parsed.order,
          tags: parsed.metadata?.tags || parsed.tags || [],
        }
        
        if (!chunk.id || !chunk.text) {
          console.warn(`⚠️  Skipping line ${i + 1}: missing id or text`)
          continue
        }
        
        chunks.push(chunk)
      } catch (err) {
        console.error(`❌ Error parsing line ${i + 1}:`, err)
        throw new Error(`Invalid JSON in line ${i + 1}`)
      }
    }
    
    if (chunks.length === 0) {
      console.error('❌ No valid chunks found in file')
      process.exit(1)
    }
    
    console.log(`✅ Parsed ${chunks.length} valid chunks`)
    
    // Step 4: Index chunks
    console.log(`\n🚀 Step 4: Indexing ${chunks.length} chunks...\n`)
    
    let indexed = 0
    let errors = 0
    const startTime = Date.now()
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      try {
        // Progress logging
        const progress = `[${i + 1}/${chunks.length}]`
        console.log(`${progress} Indexing: ${chunk.id} (order: ${chunk.order ?? 'N/A'})`)
        
        // Generate embedding
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`
        
        // Prepare metadata JSON
        const metadataJson = JSON.stringify({
          lesson: chunk.metadata?.lesson ?? chunk.lesson ?? 1,
          source: chunk.metadata?.source ?? chunk.source,
          order: chunk.metadata?.order ?? chunk.order,
          title: chunk.metadata?.title,
          language: chunk.metadata?.language ?? 'he',
          tags: chunk.metadata?.tags ?? chunk.tags ?? [],
        })
        
        // Insert into database
        await prisma.$executeRawUnsafe(
          `INSERT INTO knowledge_chunks (id, text, metadata, embedding, source, lesson, "order", tags, "createdAt")
          VALUES ($1, $2, $3::jsonb, $4::vector, $5, $6, $7, $8, NOW())
          ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding,
            source = EXCLUDED.source,
            lesson = EXCLUDED.lesson,
            "order" = EXCLUDED."order",
            tags = EXCLUDED.tags`,
          chunk.id,
          chunk.text,
          metadataJson,
          embeddingStr,
          chunk.source ?? null,
          chunk.lesson ?? 1,
          chunk.order ?? null,
          chunk.tags ?? []
        )
        
        indexed++
      } catch (err) {
        errors++
        console.error(`   ✗ Error indexing chunk ${chunk.id}:`, err instanceof Error ? err.message : err)
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    
    // Final summary
    console.log(`\n${'='.repeat(80)}`)
    console.log(`✨ Reset and Re-index Complete!`)
    console.log(`   ✅ Indexed: ${indexed}/${chunks.length}`)
    console.log(`   ❌ Errors: ${errors}`)
    console.log(`   ⏱️  Duration: ${duration}s`)
    console.log(`${'='.repeat(80)}\n`)
    
    if (errors > 0) {
      console.warn(`⚠️  Warning: ${errors} chunks failed to index`)
      process.exit(1)
    }
    
    console.log('✅ Lesson 1 RAG has been successfully reset and re-indexed!')
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

