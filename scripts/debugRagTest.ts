// Debug script to test RAG retrieval and prompt building
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { MessageSender } from '@prisma/client'

async function testRAGQuery() {
  const testQuery = 'מה זה מעגל התודעה?'
  
  console.log('🔍 Testing RAG for query:', testQuery)
  console.log('='.repeat(60))
  
  try {
    // 1. Test RAG retrieval
    console.log('\n📚 Step 1: Retrieving RAG chunks...')
    const knowledgeChunks = await searchKnowledge(testQuery, 5)
    
    console.log(`\n✅ Retrieved ${knowledgeChunks.length} chunks:`)
    knowledgeChunks.forEach((chunk, idx) => {
      const title = chunk.metadata?.title || chunk.id
      const lesson = chunk.lesson ? ` (${chunk.lesson})` : ''
      console.log(`\n  [${idx + 1}] ${title}${lesson}`)
      console.log(`      ID: ${chunk.id}`)
      console.log(`      Text preview: ${chunk.text.substring(0, 150)}...`)
      
      // Check if this chunk contains "מעגל התודעה"
      if (chunk.text.includes('מעגל התודעה') || chunk.text.includes('מעגל התודעה')) {
        console.log(`      ✅ CONTAINS "מעגל התודעה"`)
      }
    })
    
    // 2. Check if any chunk contains the answer
    const hasAnswer = knowledgeChunks.some(chunk => 
      chunk.text.includes('מעגל התודעה') || 
      chunk.text.includes('מעגל התודעה') ||
      chunk.text.toLowerCase().includes('circle of consciousness')
    )
    
    console.log(`\n📊 Analysis:`)
    console.log(`   Has relevant content: ${hasAnswer ? '✅ YES' : '❌ NO'}`)
    
    if (!hasAnswer) {
      console.log(`   ⚠️  WARNING: No chunks found containing "מעגל התודעה"`)
      console.log(`   This may indicate:`)
      console.log(`   - The term is not in the indexed materials`)
      console.log(`   - The embedding search needs improvement`)
      console.log(`   - The chunks need to be re-indexed`)
    }
    
    // 3. Build the prompt
    console.log('\n📝 Step 2: Building prompt...')
    const promptMessages = buildPrompt(
      testQuery,
      [], // No conversation history for this test
      knowledgeChunks,
      [] // No user memories for this test
    )
    
    console.log(`\n✅ Built prompt with ${promptMessages.length} messages:`)
    promptMessages.forEach((msg, idx) => {
      console.log(`\n  [${idx + 1}] Role: ${msg.role}`)
      if (msg.role === 'system') {
        const content = typeof msg.content === 'string' ? msg.content : ''
        const preview = content.substring(0, 200)
        console.log(`      Content preview: ${preview}...`)
        
        // Check for key instructions
        if (content.includes('CONTEXT') || content.includes('context')) {
          console.log(`      ✅ Contains CONTEXT instructions`)
        }
        if (content.includes('אין לי מספיק מידע')) {
          console.log(`      ✅ Contains anti-hallucination instruction`)
        }
      } else if (msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : ''
        if (content.includes('CONTEXT')) {
          console.log(`      ✅ Contains CONTEXT block`)
          const contextStart = content.indexOf('CONTEXT')
          const contextPreview = content.substring(contextStart, contextStart + 300)
          console.log(`      Context preview: ${contextPreview}...`)
        } else {
          const preview = content.substring(0, 100)
          console.log(`      Content: ${preview}...`)
        }
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : ''
        const preview = content.substring(0, 100)
        console.log(`      Example response: ${preview}...`)
      }
    })
    
    // 4. Verify prompt structure
    console.log('\n🔍 Step 3: Verifying prompt structure...')
    const systemMessages = promptMessages.filter(m => m.role === 'system')
    const contextMessages = promptMessages.filter(m => {
      const content = typeof m.content === 'string' ? m.content : ''
      return content.includes('CONTEXT')
    })
    const userMessages = promptMessages.filter(m => m.role === 'user')
    
    console.log(`   System messages: ${systemMessages.length} (should be 1-2)`)
    console.log(`   Context messages: ${contextMessages.length} (should be 1 if chunks exist)`)
    console.log(`   User messages: ${userMessages.length} (should be 1)`)
    
    // Check order: system should come first, context before user message
    const firstSystemIdx = promptMessages.findIndex(m => m.role === 'system')
    const contextIdx = promptMessages.findIndex(m => {
      const content = typeof m.content === 'string' ? m.content : ''
      return content.includes('CONTEXT')
    })
    const lastUserIdx = promptMessages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop() || -1
    
    if (firstSystemIdx === 0) {
      console.log(`   ✅ System message is first`)
    } else {
      console.log(`   ❌ System message should be first (found at index ${firstSystemIdx})`)
    }
    
    if (contextIdx >= 0 && contextIdx < lastUserIdx) {
      console.log(`   ✅ Context comes before final user message`)
    } else if (contextIdx >= 0) {
      console.log(`   ⚠️  Context comes after user message (may reduce effectiveness)`)
    }
    
    // 5. Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary:')
    console.log(`   Query: "${testQuery}"`)
    console.log(`   Chunks retrieved: ${knowledgeChunks.length}`)
    console.log(`   Contains answer: ${hasAnswer ? '✅' : '❌'}`)
    console.log(`   Prompt messages: ${promptMessages.length}`)
    console.log(`   Structure valid: ${firstSystemIdx === 0 && (contextIdx < 0 || contextIdx < lastUserIdx) ? '✅' : '⚠️'}`)
    
    if (hasAnswer && knowledgeChunks.length > 0) {
      console.log('\n✅ RAG pipeline appears to be working correctly!')
      console.log('   The model should be able to answer based on the retrieved chunks.')
    } else {
      console.log('\n⚠️  RAG pipeline may have issues:')
      if (!hasAnswer) {
        console.log('   - No relevant chunks found for the query')
      }
      if (knowledgeChunks.length === 0) {
        console.log('   - No chunks retrieved (database may be empty)')
        console.log('   - Run: pnpm rag:index:lesson1')
      }
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error)
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      console.error('\n💡 Tip: Make sure DATABASE_URL is set in .env file')
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testRAGQuery().catch(console.error)

