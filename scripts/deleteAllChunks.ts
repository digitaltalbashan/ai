// Script to delete all chunks before rebuilding
import { prisma } from '../src/server/db/client'

async function main() {
  console.log('🗑️  Deleting all chunks from database...')
  
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM knowledge_chunks`
  )
  
  console.log('✅ All chunks deleted')
  
  // Count to verify
  const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM knowledge_chunks`
  )
  
  console.log(`📊 Remaining chunks: ${count[0].count}`)
  
  await prisma.$disconnect()
}

main().catch(console.error)

