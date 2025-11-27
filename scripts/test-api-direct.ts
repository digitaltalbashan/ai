// Direct API test
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'

async function test() {
  try {
    console.log('1. Testing database...')
    const count = await prisma.knowledgeChunk.count()
    console.log('   ✅ Database:', count, 'chunks')
    
    console.log('\n2. Testing RAG search...')
    const chunks = await searchKnowledge('מה זה מעגל התודעה?', 3)
    console.log('   ✅ RAG:', chunks.length, 'chunks found')
    
    console.log('\n3. Testing prompt building...')
    const prompt = buildPrompt('מה זה מעגל התודעה?', [], chunks, [])
    console.log('   ✅ Prompt:', prompt.length, 'messages')
    
    console.log('\n4. Testing LLM...')
    const response = await chatCompletion(prompt, { temperature: 0.7, maxTokens: 200 })
    console.log('   ✅ LLM response:', response.choices[0]?.message?.content?.substring(0, 100))
    
    console.log('\n✅ All tests passed!')
    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

test()
