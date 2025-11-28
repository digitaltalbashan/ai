// Copy embeddings from server to local database (if chunks match)
// This avoids calling OpenAI API and spending tokens
import { prisma as localPrisma } from '../src/server/db/client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

// Server database connection
const serverDatabaseUrl = process.env.SERVER_DATABASE_URL || ''
const serverPrisma = new PrismaClient({
  datasources: {
    db: {
      url: serverDatabaseUrl
    }
  }
})

interface Chunk {
  id: string
  embedding: string
}

async function copyEmbeddingsFromServer() {
  console.log('🔄 Copying embeddings from server to local database...')
  console.log('='.repeat(100))
  console.log('')

  if (!serverDatabaseUrl) {
    console.error('❌ SERVER_DATABASE_URL not set in .env')
    console.log('   Set SERVER_DATABASE_URL to copy embeddings from server')
    process.exit(1)
  }

  try {
    // Get chunks from server
    console.log('📥 Fetching chunks from server...')
    const serverChunks = await serverPrisma.$queryRawUnsafe<Chunk[]>(`
      SELECT 
        id,
        embedding::text as embedding
      FROM knowledge_chunks
    `)
    console.log(`✅ Found ${serverChunks.length} chunks on server`)
    console.log('')

    // Get local chunks
    console.log('📥 Fetching chunks from local database...')
    const localChunks = await localPrisma.$queryRawUnsafe<Array<{ id: string }>>(`
      SELECT id FROM knowledge_chunks
    `)
    console.log(`✅ Found ${localChunks.length} chunks in local database`)
    console.log('')

    // Create a map of server chunks
    const serverChunksMap = new Map<string, string>()
    for (const chunk of serverChunks) {
      serverChunksMap.set(chunk.id, chunk.embedding)
    }

    let copied = 0
    let notFound = 0
    let errors = 0

    // Copy embeddings for matching chunks
    for (const localChunk of localChunks) {
      try {
        const serverEmbedding = serverChunksMap.get(localChunk.id)
        
        if (!serverEmbedding) {
          console.log(`⚠️  Chunk ${localChunk.id} not found on server - will need re-indexing`)
          notFound++
          continue
        }

        // Update local chunk with server embedding
        await localPrisma.$executeRawUnsafe(
          `UPDATE knowledge_chunks 
           SET embedding = $1::vector
           WHERE id = $2`,
          serverEmbedding,
          localChunk.id
        )

        copied++
        process.stdout.write(`   ✓ ${copied}/${localChunks.length} embeddings copied...\r`)
      } catch (error) {
        console.error(`\n❌ Error copying embedding for chunk ${localChunk.id}:`, error)
        errors++
      }
    }

    console.log('\n' + '='.repeat(100))
    console.log('✅ Copying complete!')
    console.log(`   Copied: ${copied}`)
    console.log(`   Not found on server: ${notFound}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total local chunks: ${localChunks.length}`)
    console.log('')

    if (notFound > 0) {
      console.log('⚠️  Some chunks were not found on server.')
      console.log('   These will need to be re-indexed with OpenAI API')
      console.log(`   Estimated cost: ~$${(notFound * 0.00001).toFixed(4)}`)
    }
  } catch (error) {
    console.error('❌ Error during copying:', error)
    process.exit(1)
  } finally {
    await localPrisma.$disconnect()
    await serverPrisma.$disconnect()
  }
}

copyEmbeddingsFromServer().catch(console.error)

