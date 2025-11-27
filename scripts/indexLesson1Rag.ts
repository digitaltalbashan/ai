// Script to index lesson1 RAG chunks from JSONL file
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface ChunkData {
  id: string
  text: string
  metadata?: Record<string, any>
  source?: string
  lesson?: string
  order?: number
  tags?: string[]
}

async function main() {
  // Load the JSONL file from /data/rag/lesson1_rag.jsonl
  const filePath = join(process.cwd(), 'data', 'rag', 'lesson1_rag.jsonl')

  console.log(`📚 Reading knowledge chunks from: ${filePath}`)

  try {
    // Read and parse the JSONL file
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())

    if (lines.length === 0) {
      console.error('❌ No lines found in file')
      process.exit(1)
    }

    console.log(`📄 Found ${lines.length} lines to parse`)

    // Parse each line into chunk data
    const chunks: ChunkData[] = []
    for (let i = 0; i < lines.length; i++) {
      try {
        const chunk = JSON.parse(lines[i]) as ChunkData
        if (!chunk.id || !chunk.text) {
          console.warn(`⚠️  Skipping line ${i + 1}: missing id or text`)
          continue
        }
        chunks.push(chunk)
      } catch (err) {
        console.error(`❌ Error parsing line ${i + 1}:`, err)
        throw new Error(`Invalid JSON in line ${i + 1}: ${lines[i].substring(0, 100)}...`)
      }
    }

    if (chunks.length === 0) {
      console.error('❌ No valid chunks found in file')
      process.exit(1)
    }

    console.log(`✅ Parsed ${chunks.length} valid chunks`)
    console.log(`🚀 Starting indexing process...\n`)

    let indexed = 0
    let errors = 0
    const startTime = Date.now()

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      try {
        // Progress logging
        console.log(`[${i + 1}/${chunks.length}] Indexing chunk: ${chunk.id}`)

        // Generate embedding using embedText from OpenAI wrapper
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`

        // Insert into KnowledgeChunk table with pgvector embedding
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
          chunk.metadata ? JSON.stringify(chunk.metadata) : null,
          embeddingStr,
          chunk.source ?? null,
          chunk.lesson ?? null,
          chunk.order ?? null,
          chunk.tags ?? []
        )

        indexed++
        console.log(`   ✓ Successfully indexed chunk ${chunk.id}`)
      } catch (err) {
        errors++
        console.error(`   ✗ Error indexing chunk ${chunk.id}:`, err instanceof Error ? err.message : err)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Final summary
    console.log(`\n${'='.repeat(50)}`)
    console.log(`✨ Indexing complete!`)
    console.log(`   ✅ Indexed: ${indexed}/${chunks.length}`)
    console.log(`   ❌ Errors: ${errors}`)
    console.log(`   ⏱️  Duration: ${duration}s`)
    console.log(`${'='.repeat(50)}\n`)

    if (errors > 0) {
      console.warn(`⚠️  Warning: ${errors} chunks failed to index`)
      process.exit(1)
    }
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

