// Script to index digital course RAG chunks from JSONL file
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface ChunkData {
  id: string
  text: string
  summary?: string
  metadata?: Record<string, any>
  source?: string
  lesson?: number
  order?: number
  tags?: string[]
}

async function main() {
  // Load the JSONL file
  const filePath = join(process.cwd(), 'data', 'rag', 'course_digital_rag.jsonl')

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
        console.log(`[${i + 1}/${chunks.length}] Indexing: ${chunk.id} (order: ${chunk.metadata?.order || i + 1})`)

        // Generate embedding
        const embedding = await embedText(chunk.text)

        // Prepare metadata
        const metadata = {
          ...chunk.metadata,
          title: chunk.metadata?.title || chunk.id,
          language: chunk.metadata?.language || 'he',
          tags: chunk.metadata?.tags || [],
        }

        // Upsert chunk (insert or update if exists)
        await prisma.$executeRawUnsafe(
          `INSERT INTO knowledge_chunks (id, text, metadata, source, lesson, "order", tags, embedding)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::text[], $8::vector)
           ON CONFLICT (id) 
           DO UPDATE SET 
             text = EXCLUDED.text,
             metadata = EXCLUDED.metadata,
             source = EXCLUDED.source,
             lesson = EXCLUDED.lesson,
             "order" = EXCLUDED."order",
             tags = EXCLUDED.tags,
             embedding = EXCLUDED.embedding`,
          chunk.id,
          chunk.text,
          JSON.stringify(metadata),
          chunk.source || chunk.metadata?.source || 'course_digital_rag.jsonl',
          chunk.lesson || chunk.metadata?.lesson || 1,
          chunk.order || chunk.metadata?.order || i + 1,
          JSON.stringify(metadata.tags || []),
          `[${embedding.join(',')}]`
        )

        indexed++
      } catch (error) {
        errors++
        console.error(`❌ Error indexing chunk ${chunk.id}:`, error)
        if (error instanceof Error) {
          console.error(`   Error message: ${error.message}`)
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('\n' + '='.repeat(80))
    console.log('✨ Indexing Complete!')
    console.log('='.repeat(80))
    console.log(`   ✅ Indexed: ${indexed}/${chunks.length}`)
    console.log(`   ❌ Errors: ${errors}`)
    console.log(`   ⏱️  Duration: ${duration}s`)
    console.log('='.repeat(80))

    if (indexed === chunks.length) {
      console.log('\n✅ All chunks indexed successfully!')
      process.exit(0)
    } else {
      console.log(`\n⚠️  Some chunks failed to index. Please review the errors above.`)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Fatal error:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Stack trace:', error.stack)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)

