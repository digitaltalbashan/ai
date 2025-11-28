// Script to index QnA JSONL file (with question and answer_style fields)
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface QnAChunk {
  id: string
  question: string
  answer_style: string
  metadata?: Record<string, any>
}

async function main() {
  const filePath = process.argv[2] || join(process.cwd(), 'data/rag/qna.jsonl')

  console.log(`📚 Reading QnA chunks from: ${filePath}`)

  try {
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())

    const chunks: QnAChunk[] = lines.map((line) => {
      try {
        return JSON.parse(line)
      } catch (err) {
        throw new Error(`Invalid JSON in line: ${line}`)
      }
    })

    if (chunks.length === 0) {
      console.error('❌ No valid chunks found in file')
      process.exit(1)
    }

    console.log(`✅ Found ${chunks.length} chunks to index\n`)

    let indexed = 0
    let errors = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      try {
        if (!chunk.id || !chunk.question || !chunk.answer_style) {
          console.warn(`⚠️  Skipping chunk ${i + 1}: missing required fields`)
          errors++
          continue
        }

        // Combine question and answer_style into text
        const text = `שאלה: ${chunk.question}\n\nתשובה: ${chunk.answer_style}`

        // Generate embedding from the combined text
        const embedding = await embedText(text)
        const embeddingStr = `[${embedding.join(',')}]`

        // Prepare metadata
        const metadata = {
          ...chunk.metadata,
          question: chunk.question,
          answer_style: chunk.answer_style,
          original_format: 'qna'
        }

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
          text,
          JSON.stringify(metadata),
          embeddingStr,
          chunk.metadata?.source || 'qna',
          chunk.metadata?.lesson || null,
          chunk.metadata?.order || i + 1,
          chunk.metadata?.tags || []
        )

        indexed++
        
        // Progress indicator
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`   ✓ ${i + 1}/${chunks.length} chunks indexed...\r`)
        }
      } catch (err) {
        console.error(`❌ Error indexing chunk ${chunk.id}:`, err)
        errors++
      }
    }

    console.log(`\n✅ Indexing complete!`)
    console.log(`   Indexed: ${indexed}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total: ${chunks.length}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

