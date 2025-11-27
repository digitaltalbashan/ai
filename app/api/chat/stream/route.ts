// POST /api/chat/stream - Streaming chat endpoint
// Note: Streaming is not supported with Python RAG, so we'll return the full response
import { NextRequest } from 'next/server'
import { getServerSession } from '@/src/auth'
import { prisma } from '@/src/server/db/client'
import { MessageSender } from '@prisma/client'
import { queryWithPythonRag } from '@/src/server/vector/queryWithPythonRag'
import { queryWithOpenAIRag } from '@/src/server/vector/queryWithOpenAIRag'
import { ChatRequest } from '@/src/types'
import { getUserContext, formatUserContextForPrompt, extractContextFromConversation } from '@/src/server/userContext'

// Ensure Node.js runtime (not edge) for Prisma support
export const runtime = 'nodejs'

// Check if OpenAI should be used
const USE_OPENAI = process.env.USE_OPENAI === 'true' && process.env.OPENAI_API_KEY !== undefined

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const session = await getServerSession()
    const userId = (session?.user as any)?.id
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Please sign in' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const body: ChatRequest = await request.json()
    const { message, conversationId } = body

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get user (should exist from auth)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get or create conversation
    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
      if (!conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: null,
        },
      })
    }

    // 3. Store user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.USER,
        content: message,
      },
    })

    // 4. Fetch recent messages (last 20) - BEFORE storing the new user message
    // We need to get messages before the current one
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    // 5. Get user context
    const userContext = await getUserContext(userId)
    const contextText = formatUserContextForPrompt(userContext)

    // 6. Use Python RAG with llama.cpp (best results)
    // Combine user message with recent conversation context for better retrieval
    // BUT: send only current question to LLM, use searchQuery only for chunk retrieval
    const searchQuery = recentMessages.length > 0
      ? `${message} ${recentMessages.slice(-3).map(m => m.content).join(' ')}`
      : message
    
    console.log(`\n${'='.repeat(100)}`)
    console.log(`📝 שאלה נשאלת:`)
    console.log(`   "${message}"`)
    console.log(`${'='.repeat(100)}\n`)
    
    console.log(`🔍 Search Query (with history): "${searchQuery.substring(0, 100)}..."`)
    console.log(`🤖 מודל: ${USE_OPENAI ? 'OpenAI API' : 'Python RAG with llama.cpp'}`)
    if (USE_OPENAI) {
      console.log(`   Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`)
      console.log(`   Temperature: 0.3`)
      console.log(`   Max Tokens: 2000`)
    }
    console.log(`${'='.repeat(100)}\n`)
    
    // 7. Use OpenAI API if enabled, otherwise use Python RAG with llama.cpp
    // searchQuery: used for chunk retrieval (includes history for better context)
    // message: used for LLM (current question only)
    // Include user context in the prompt
    const ragResult = USE_OPENAI
      ? await queryWithOpenAIRag(searchQuery, message, 50, 8, contextText)
      : await queryWithPythonRag(searchQuery, message, 50, 8)
    
    // Log RAG retrieval with FULL details
    console.log(`\n${'='.repeat(100)}`)
    console.log(`📚 צ'אנקים שנמצאו (${ragResult.sources.length} בסך הכל):`)
    console.log(`${'='.repeat(100)}`)
    ragResult.sources.forEach((chunk, idx) => {
      console.log(`\n  [${idx + 1}] ID: ${chunk.id}`)
      console.log(`      Source: ${chunk.source}`)
      console.log(`      Chunk Index: ${chunk.chunk_index}`)
      console.log(`      Rerank Score: ${chunk.rerank_score.toFixed(3)}`)
      console.log(`      Distance: ${chunk.distance.toFixed(3)}`)
      console.log(`      Text (FULL):`)
      console.log(`      ${'─'.repeat(96)}`)
      console.log(`      ${chunk.text}`)
      console.log(`      ${'─'.repeat(96)}`)
    })
    
    if (ragResult.timing) {
      console.log(`\n⏱️  Timing:`)
      console.log(`   Retrieve: ${ragResult.timing.retrieve_time?.toFixed(2)}s`)
      console.log(`   Rerank: ${ragResult.timing.rerank_time?.toFixed(2)}s`)
      console.log(`   LLM: ${ragResult.timing.llm_time?.toFixed(2)}s`)
      console.log(`   Total: ${ragResult.timing.total_time?.toFixed(2)}s`)
    }
    console.log(`${'='.repeat(100)}\n`)

    const assistantResponse = ragResult.answer || 'לא הצלחתי ליצור תשובה.'

    // 8. Store assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.ASSISTANT,
        content: assistantResponse,
      },
    })

    // 9. Extract and update user context from conversation
    try {
      await extractContextFromConversation(userId, message, assistantResponse)
    } catch (error) {
      console.error('Error updating user context:', error)
      // Don't fail the request if context update fails
    }

    // 7. Return response as stream (simulate streaming by sending in chunks)
    // Since Python RAG doesn't support true streaming, we'll send the response in chunks
    const encoder = new TextEncoder()
    const chunks = assistantResponse.match(/.{1,50}/g) || [assistantResponse]
    
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        controller.close()
      },
    })

    // Return streaming response with proper headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Conversation-Id': conversation.id,
      },
    })
  } catch (error) {
    console.error('Chat stream API error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', errorMessage)
    if (errorStack) {
      console.error('Stack trace:', errorStack)
    }
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

