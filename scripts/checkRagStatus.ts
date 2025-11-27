// Script to check RAG indexing status
import { prisma } from '../src/server/db/client'

async function main() {
  try {
    const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*) as count FROM knowledge_chunks'
    )
    console.log(`✅ סה"כ chunks במסד הנתונים: ${count[0].count.toLocaleString()}`)
    
    // Count by source
    const bySource = await prisma.$queryRawUnsafe<Array<{ source: string; count: bigint }>>(
      `SELECT source, COUNT(*) as count 
       FROM knowledge_chunks 
       WHERE source IS NOT NULL
       GROUP BY source 
       ORDER BY count DESC 
       LIMIT 20`
    )
    
    console.log(`\n📋 Top 20 sources:`)
    bySource.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.source}: ${row.count} chunks`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

