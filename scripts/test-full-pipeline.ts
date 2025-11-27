// Test script to verify the full RAG + LLM pipeline
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'

async function testFullPipeline() {
  console.log('🧪 Testing Full RAG + LLM Pipeline')
  console.log('='.repeat(80))
  
  try {
    // 1. Check if RAG data exists
    const chunkCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*) as count FROM knowledge_chunks'
    )
    const count = Number(chunkCount[0]?.count || 0)
    
    if (count === 0) {
      console.error('❌ No RAG chunks found in database!')
      console.log('   Run: pnpm rag:reset:lesson1')
      process.exit(1)
    }
    
    console.log(`✅ Found ${count} RAG chunks in database`)
    
    // 2. Test RAG search
    console.log('\n📚 Testing RAG search...')
    const query = 'מה זה מעגל התודעה?'
    const knowledgeChunks = await searchKnowledge(query, 5)
    
    console.log(`✅ Retrieved ${knowledgeChunks.length} relevant chunks`)
    knowledgeChunks.forEach((chunk, idx) => {
      console.log(`   [${idx + 1}] ${chunk.id}: ${chunk.text.substring(0, 100)}...`)
    })
    
    // 3. Test prompt building
    console.log('\n📝 Testing prompt building...')
    const promptMessages = buildPrompt(
      query,
      [], // No conversation history
      knowledgeChunks,
      [] // No user memories
    )
    
    console.log(`✅ Built prompt with ${promptMessages.length} messages`)
    const hasContext = promptMessages.some(m => 
      typeof m.content === 'string' && m.content.includes('CONTEXT (from course materials)')
    )
    console.log(`   ${hasContext ? '✅' : '❌'} Context block found in prompt`)
    
    // 4. Test LLM call (if Ollama is available)
    console.log('\n🤖 Testing LLM call...')
    try {
      const completion = await chatCompletion(promptMessages, {
        temperature: 0.7,
        maxTokens: 200,
      })
      
      const response = completion.choices[0]?.message?.content?.trim() || ''
      if (response) {
        console.log(`✅ LLM response received (${response.length} chars)`)
        console.log(`   Preview: ${response.substring(0, 150)}...`)
      } else {
        console.error('❌ Empty LLM response')
      }
    } catch (error) {
      console.error('❌ LLM call failed:', error instanceof Error ? error.message : error)
      console.log('   Make sure Ollama is running: ollama serve')
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✨ Full pipeline test complete!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testFullPipeline().catch(console.error)
