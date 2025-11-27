// Test script to verify RAG returns correct chunks for "מה זה מעגל תודעה?"
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'

async function testCircleQuery() {
  const testQuery = 'מה זה מעגל תודעה?'
  
  console.log('🧪 Testing RAG Query')
  console.log('='.repeat(80))
  console.log(`Query: "${testQuery}"`)
  console.log('='.repeat(80))
  
  try {
    // Search for relevant chunks
    console.log('\n📚 Searching for relevant chunks...\n')
    const knowledgeChunks = await searchKnowledge(testQuery, 5)
    
    console.log(`✅ Retrieved ${knowledgeChunks.length} chunks:\n`)
    
    let foundRelevantChunk = false
    
    knowledgeChunks.forEach((chunk, idx) => {
      const title = chunk.metadata?.title || chunk.id
      const order = chunk.metadata?.order ?? 'N/A'
      const lesson = chunk.metadata?.lesson ?? chunk.lesson ?? 'N/A'
      
      // Check if chunk contains the term
      const containsTerm = chunk.text.includes('מעגל התודעה') || 
                          chunk.text.includes('מעגל תודעה')
      
      if (containsTerm) {
        foundRelevantChunk = true
      }
      
      console.log(`[${idx + 1}] ${chunk.id}`)
      console.log(`    Title: ${title}`)
      console.log(`    Order: ${order}`)
      console.log(`    Lesson: ${lesson}`)
      console.log(`    Contains "מעגל התודעה": ${containsTerm ? '✅ YES' : '❌ NO'}`)
      console.log(`    Text preview: ${chunk.text.substring(0, 200)}...`)
      console.log('')
    })
    
    // Analysis
    console.log('='.repeat(80))
    console.log('📊 Analysis:')
    console.log(`   Total chunks retrieved: ${knowledgeChunks.length}`)
    console.log(`   Contains relevant content: ${foundRelevantChunk ? '✅ YES' : '❌ NO'}`)
    
    if (foundRelevantChunk) {
      console.log('\n✅ SUCCESS: RAG found chunks containing "מעגל התודעה"')
      
      // Show the relevant chunk content
      const relevantChunk = knowledgeChunks.find(chunk => 
        chunk.text.includes('מעגל התודעה') || chunk.text.includes('מעגל תודעה')
      )
      
      if (relevantChunk) {
        console.log('\n📄 Relevant chunk content:')
        console.log('-'.repeat(80))
        
        // Extract the relevant section
        const termIndex = relevantChunk.text.indexOf('מעגל התודעה')
        if (termIndex >= 0) {
          const start = Math.max(0, termIndex - 100)
          const end = Math.min(relevantChunk.text.length, termIndex + 500)
          const excerpt = relevantChunk.text.substring(start, end)
          console.log(`...${excerpt}...`)
        } else {
          console.log(relevantChunk.text.substring(0, 600))
        }
        console.log('-'.repeat(80))
      }
    } else {
      console.log('\n❌ FAILURE: RAG did not find chunks containing "מעגל התודעה"')
      console.log('   This may indicate:')
      console.log('   - The chunks were not indexed correctly')
      console.log('   - The search query needs improvement')
      console.log('   - The term is spelled differently in the chunks')
    }
    
    // Verify chunk 002 is in the results (it should contain the definition)
    const chunk002 = knowledgeChunks.find(chunk => chunk.id === 'lesson1_chunk_002')
    if (chunk002) {
      console.log('\n✅ Found chunk 002 (expected to contain the definition)')
    } else {
      console.log('\n⚠️  Chunk 002 not in top results (may still be correct if other chunks are more relevant)')
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Test complete!')
    
  } catch (error) {
    console.error('❌ Error during test:', error)
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      console.error('\n💡 Tip: Make sure DATABASE_URL is set in .env file')
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testCircleQuery().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

