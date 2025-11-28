// Re-index all chunks with OpenAI embeddings (1536 dimensions)
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

interface Chunk {
  id: string
  text: string
  source: string | null
  lesson: string | null
  order: number | null
  tags: string[] | null
  metadata: any
}

async function reindexChunks() {
  console.log('🔄 Starting re-indexing of chunks with OpenAI embeddings...')
  console.log('='.repeat(100))
  console.log('')

  try {
    // Get all chunks from database
    console.log('📥 Fetching all chunks from database...')
    const chunks = await prisma.$queryRawUnsafe<Chunk[]>(`
      SELECT 
        id,
        text,
        source,
        lesson,
        "order",
        tags,
        metadata
      FROM knowledge_chunks
      ORDER BY id
    `)

    console.log(`✅ Found ${chunks.length} chunks to re-index`)
    console.log('')

    let indexed = 0
    let errors = 0

    for (const chunk of chunks) {
      try {
        console.log(`[${indexed + 1}/${chunks.length}] Re-indexing: ${chunk.id}`)

        // Generate new embedding with OpenAI
        const embedding = await embedText(chunk.text)
        const embeddingStr = `[${embedding.join(',')}]`

        // Update chunk with new embedding
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_chunks 
           SET embedding = $1::vector
           WHERE id = $2`,
          embeddingStr,
          chunk.id
        )

        indexed++
        process.stdout.write(`   ✓ ${indexed}/${chunks.length} chunks re-indexed...\r`)

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`\n❌ Error re-indexing chunk ${chunk.id}:`, error)
        errors++
      }
    }

    console.log('\n' + '='.repeat(100))
    console.log('✅ Re-indexing complete!')
    console.log(`   Re-indexed: ${indexed}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total: ${chunks.length}`)
    console.log('')

    // Verify dimensions
    console.log('🔍 Verifying embedding dimensions...')
    const dimensionCheck = await prisma.$queryRawUnsafe<Array<{ dims: number }>>(`
      SELECT DISTINCT vector_dims(embedding) as dims
      FROM knowledge_chunks
    `)
    console.log('📊 Embedding dimensions:', dimensionCheck.map(d => d.dims).join(', '))
    console.log('')

    if (dimensionCheck.length === 1 && dimensionCheck[0].dims === 1536) {
      console.log('✅ All chunks now have 1536 dimensions (OpenAI embeddings)')
    } else {
      console.log('⚠️  Warning: Not all chunks have 1536 dimensions')
    }
  } catch (error) {
    console.error('❌ Error during re-indexing:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

reindexChunks().catch(console.error)

