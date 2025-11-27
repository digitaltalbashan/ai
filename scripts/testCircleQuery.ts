// Test script for "מה זה מעגל תודעה?" query
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'
import { buildPrompt } from '../src/server/prompt/buildPrompt'
import { chatCompletion } from '../src/server/openai'

async function testCircleQuery() {
  const testQuery = 'מה זה מעגל תודעה?'
  
  console.log('🧪 Testing query:', testQuery)
  console.log('='.repeat(80))
  
  try {
    // 1. Search RAG
    console.log('\n📚 Step 1: RAG Search')
    const knowledgeChunks = await searchKnowledge(testQuery, 5)
    
    console.log(`\n✅ Retrieved ${knowledgeChunks.length} chunks:`)
    knowledgeChunks.forEach((chunk, idx) => {
      const title = chunk.metadata?.title || chunk.id
      const order = chunk.metadata?.order ?? 'N/A'
      console.log(`\n  [${idx + 1}] ID: ${chunk.id}`)
      console.log(`      Title: ${title}`)
      console.log(`      Order: ${order}`)
      console.log(`      Text: ${chunk.text.substring(0, 300)}...`)
      
      // Check if contains the term
      if (chunk.text.includes('מעגל התודעה') || chunk.text.includes('מעגל תודעה')) {
        console.log(`      ✅ CONTAINS "מעגל התודעה"`)
      }
    })
    
    // 2. Check if relevant chunks were found
    const hasRelevantContent = knowledgeChunks.some(chunk => 
      chunk.text.includes('מעגל התודעה') || 
      chunk.text.includes('מעגל תודעה')
    )
    
    console.log(`\n📊 Analysis:`)
    console.log(`   Has relevant content: ${hasRelevantContent ? '✅ YES' : '❌ NO'}`)
    
    if (!hasRelevantContent) {
      console.log(`   ⚠️  WARNING: No chunks found containing "מעגל התודעה"`)
      console.log(`   This may indicate the RAG search needs improvement or chunks need re-indexing`)
    }
    
    // 3. Build prompt
    console.log('\n📝 Step 2: Building Prompt')
    const promptMessages = buildPrompt(
      testQuery,
      [], // No conversation history
      knowledgeChunks,
      [] // No user memories
    )
    
    // Extract and display CONTEXT
    const contextMessage = promptMessages.find(m => {
      const content = typeof m.content === 'string' ? m.content : ''
      return content.includes('CONTEXT (from course materials)')
    })
    
    if (contextMessage) {
      const contextText = typeof contextMessage.content === 'string' ? contextMessage.content : ''
      console.log(`\n✅ CONTEXT block found (${contextText.length} chars):`)
      console.log(contextText)
      console.log('\n' + '='.repeat(80))
    } else {
      console.log(`\n❌ No CONTEXT block found in prompt!`)
    }
    
    // 4. Show system message
    const systemMessage = promptMessages.find(m => m.role === 'system' && 
      typeof m.content === 'string' && 
      m.content.includes('CONTEXT USAGE RULES')
    )
    
    if (systemMessage) {
      const systemText = typeof systemMessage.content === 'string' ? systemMessage.content : ''
      console.log(`\n✅ System message contains context rules:`)
      if (systemText.includes('אני לא רואה הסבר ברור')) {
        console.log(`   ✅ Contains correct Hebrew fallback message`)
      }
      if (systemText.includes('Do NOT invent generic psychological explanations')) {
        console.log(`   ✅ Contains anti-hallucination rule`)
      }
    }
    
    // 5. Test LLM call (only if we have context)
    if (hasRelevantContent) {
      console.log('\n🤖 Step 3: Testing LLM Response')
      console.log('Calling local LLM (Ollama)...\n')
      
      const completion = await chatCompletion(promptMessages, {
        temperature: 0.7,
        maxTokens: 500,
      })
      
      const response = completion.choices[0]?.message?.content?.trim() || ''
      
      console.log('Response:')
      console.log(response)
      console.log('\n' + '='.repeat(80))
      
      // Verify response
      if (response.includes('מעגל התודעה') || response.includes('מעגל תודעה')) {
        console.log('✅ Response mentions "מעגל התודעה"')
      }
      
      if (response.includes('מסמך') || response.includes('מלא') || response.includes('שיעור')) {
        console.log('✅ Response appears to use course material definition')
      }
      
      if (response.includes('מחשבות') && response.includes('רגשות') && response.includes('גוף')) {
        console.log('⚠️  WARNING: Response may contain generic CBT explanation instead of course material')
      }
      
      if (response.includes('אני לא רואה הסבר ברור')) {
        console.log('✅ Response correctly says it cannot find explanation (if answer not in context)')
      }
    } else {
      console.log('\n⏭️  Skipping LLM call (no relevant content or no API key)')
    }
    
    console.log('\n✅ Test complete!')
    
  } catch (error) {
    console.error('❌ Error:', error)
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      console.error('\n💡 Tip: Make sure DATABASE_URL is set in .env file')
    }
  } finally {
    await prisma.$disconnect()
  }
}

testCircleQuery().catch(console.error)

