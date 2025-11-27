// POST /api/rag/index-knowledge - Index knowledge chunks from JSONL file
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/src/server/db/client'
import { embedText } from '@/src/server/openai'
import { KnowledgeChunkData } from '@/src/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { filePath } = body

    // Default to lesson1_rag.jsonl in the project root
    const jsonlPath = filePath || join(process.cwd(), 'lesson1_rag.jsonl')

    // Read and parse JSONL file
    const fileContent = await readFile(jsonlPath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())

    const chunks: KnowledgeChunkData[] = lines.map((line) => {
      try {
        return JSON.parse(line)
      } catch (err) {
        throw new Error(`Invalid JSON in line: ${line}`)
      }
    })

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No valid chunks found in file' },
        { status: 400 }
      )
    }

    // Process chunks: generate embeddings and store
    let indexed = 0
    let errors = 0

    for (const chunk of chunks) {
      try {
        // Validate required fields
        if (!chunk.id || !chunk.text) {
          console.warn(`Skipping chunk with missing id or text:`, chunk)
          errors++
          continue
        }

        // Generate embedding
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`

        // Store in database using raw SQL (pgvector support)
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

    return NextResponse.json({
      success: true,
      indexed,
      errors,
      total: chunks.length,
    })
  } catch (error) {
    console.error('Index knowledge error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

