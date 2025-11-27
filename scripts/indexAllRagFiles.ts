// Script to index all JSONL RAG files from data/rag/ directory
import { readFile, readdir } from 'fs/promises'
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

async function indexJsonlFile(filePath: string): Promise<{ indexed: number; errors: number; total: number }> {
  console.log(`\n📚 Processing: ${filePath}`)

  try {
    // Read and parse the JSONL file
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter((line) => line.trim())

    if (lines.length === 0) {
      console.warn(`⚠️  No lines found in ${filePath}`)
      return { indexed: 0, errors: 0, total: 0 }
    }

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
        console.error(`❌ Error parsing line ${i + 1} in ${filePath}:`, err)
        // Continue with other chunks
        continue
      }
    }

    if (chunks.length === 0) {
      console.warn(`⚠️  No valid chunks found in ${filePath}`)
      return { indexed: 0, errors: 0, total: 0 }
    }

    console.log(`   📄 Found ${chunks.length} chunks`)

    let indexed = 0
    let errors = 0

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      try {
        // Generate embedding
        const embedding = await embedText(chunk.text)

        // Prepare metadata
        const metadata = {
          ...chunk.metadata,
          title: chunk.metadata?.title || chunk.id,
          language: chunk.metadata?.language || 'he',
          tags: chunk.metadata?.tags || [],
        }

        // Extract source from metadata or use filename
        const source = chunk.source || chunk.metadata?.source || filePath.split('/').pop() || 'unknown'

        // Prepare tags as array (not JSON string)
        const tagsArray = Array.isArray(metadata.tags) ? metadata.tags : []

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
          source,
          chunk.lesson || chunk.metadata?.lesson || null,
          chunk.order || chunk.metadata?.order || i + 1,
          tagsArray, // Pass array directly, not JSON string
          `[${embedding.join(',')}]`
        )

        indexed++
        
        // Progress indicator every 10 chunks
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`   ✓ ${i + 1}/${chunks.length} chunks indexed...\r`)
        }
      } catch (error) {
        errors++
        console.error(`\n   ❌ Error indexing chunk ${chunk.id}:`, error instanceof Error ? error.message : error)
      }
    }

    console.log(`   ✅ Indexed: ${indexed}/${chunks.length} chunks`)

    return { indexed, errors, total: chunks.length }
  } catch (error) {
    console.error(`❌ Error processing file ${filePath}:`, error)
    return { indexed: 0, errors: 1, total: 0 }
  }
}

async function main() {
  const ragDir = join(process.cwd(), 'data', 'rag')

  console.log('🚀 Indexing all JSONL RAG files...')
  console.log('='.repeat(80))
  console.log(`📂 Directory: ${ragDir}\n`)

  try {
    // Find all JSONL files
    const files = await readdir(ragDir)
    const jsonlFiles = files
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(ragDir, f))

    if (jsonlFiles.length === 0) {
      console.error('❌ No JSONL files found in', ragDir)
      process.exit(1)
    }

    console.log(`📋 Found ${jsonlFiles.length} JSONL files\n`)

    const startTime = Date.now()
    let totalIndexed = 0
    let totalErrors = 0
    let totalChunks = 0
    const fileResults: Array<{ file: string; indexed: number; errors: number; total: number }> = []

    // Process each file
    for (let i = 0; i < jsonlFiles.length; i++) {
      const filePath = jsonlFiles[i]
      const fileName = filePath.split('/').pop() || filePath

      console.log(`[${i + 1}/${jsonlFiles.length}] ${fileName}`)

      const result = await indexJsonlFile(filePath)
      
      totalIndexed += result.indexed
      totalErrors += result.errors
      totalChunks += result.total
      
      fileResults.push({
        file: fileName,
        indexed: result.indexed,
        errors: result.errors,
        total: result.total,
      })
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Final summary
    console.log('\n' + '='.repeat(80))
    console.log('✨ Indexing Complete!')
    console.log('='.repeat(80))
    console.log(`📁 Files processed: ${jsonlFiles.length}`)
    console.log(`✅ Total indexed: ${totalIndexed.toLocaleString()}`)
    console.log(`❌ Total errors: ${totalErrors}`)
    console.log(`📊 Total chunks: ${totalChunks.toLocaleString()}`)
    console.log(`⏱️  Duration: ${duration}s`)
    console.log(`📈 Average: ${(totalIndexed / parseFloat(duration)).toFixed(1)} chunks/second`)

    // Show files with errors
    const filesWithErrors = fileResults.filter((r) => r.errors > 0)
    if (filesWithErrors.length > 0) {
      console.log('\n⚠️  Files with errors:')
      filesWithErrors.forEach((r) => {
        console.log(`   - ${r.file}: ${r.errors} errors`)
      })
    }

    // Show top 10 files by chunk count
    const topFiles = fileResults
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    if (topFiles.length > 0) {
      console.log('\n📊 Top 10 files by chunk count:')
      topFiles.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.file}: ${r.total} chunks`)
      })
    }

    console.log('='.repeat(80) + '\n')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

