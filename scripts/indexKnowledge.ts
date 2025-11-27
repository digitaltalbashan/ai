// Script to index knowledge chunks from JSONL file
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'
import { KnowledgeChunkData } from '../src/types'

async function main() {
  const filePath = process.argv[2] || join(process.cwd(), 'lesson1_rag.jsonl')

  console.log(`Reading knowledge chunks from: ${filePath}`)

  try {
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())

    const chunks: KnowledgeChunkData[] = lines.map((line) => {
      try {
        return JSON.parse(line)
      } catch (err) {
        throw new Error(`Invalid JSON in line: ${line}`)
      }
    })

    if (chunks.length === 0) {
      console.error('No valid chunks found in file')
      process.exit(1)
    }

    console.log(`Found ${chunks.length} chunks to index`)

    let indexed = 0
    let errors = 0

    for (const chunk of chunks) {
      try {
        if (!chunk.id || !chunk.text) {
          console.warn(`Skipping chunk with missing id or text:`, chunk)
          errors++
          continue
        }

        console.log(`Indexing chunk: ${chunk.id}`)

        // Generate embedding
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`

        // Store in database
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
      } catch (err) {
        console.error(`Error indexing chunk ${chunk.id}:`, err)
        errors++
      }
    }

    console.log(`\nIndexing complete!`)
    console.log(`  Indexed: ${indexed}`)
    console.log(`  Errors: ${errors}`)
    console.log(`  Total: ${chunks.length}`)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

