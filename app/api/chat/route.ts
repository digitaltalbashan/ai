// POST /api/chat - Main chat endpoint
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/src/auth'
import { prisma } from '@/src/server/db/client'
import { MessageSender } from '@prisma/client'
import { queryWithPythonRag } from '@/src/server/vector/queryWithPythonRag'
import { queryWithOpenAIRag } from '@/src/server/vector/queryWithOpenAIRag'
import { ChatRequest, ChatResponse } from '@/src/types'
import { getUserContext, formatUserContextForPrompt, extractContextFromConversation } from '@/src/server/userContext'

// Ensure Node.js runtime (not edge) for Prisma and embeddings support
export const runtime = 'nodejs'

// Check if OpenAI should be used
const USE_OPENAI = process.env.USE_OPENAI === 'true' && process.env.OPENAI_API_KEY !== undefined

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
    const session = await getServerSession()
    const userId = (session?.user as any)?.id
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }
    const body: ChatRequest = await request.json()
    const { message, conversationId } = body

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      )
    }

    // 2. Get user (should exist from auth)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // 2. Get or create conversation
    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: null, // Can be auto-generated later
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
    
    console.log(`\n${'='.repeat(80)}`)
    console.log(`[RAG] Current Question: "${message}"`)
    console.log(`[RAG] Search Query (with history): "${searchQuery.substring(0, 100)}..."`)
    console.log(`[RAG] Using ${USE_OPENAI ? 'OpenAI API' : 'Python RAG with llama.cpp'}`)
    console.log(`${'='.repeat(80)}\n`)
    
    // Use OpenAI API if enabled, otherwise use Python RAG with llama.cpp
    // searchQuery: used for chunk retrieval (includes history for better context)
    // message: used for LLM (current question only)
    const ragResult = USE_OPENAI
      ? await queryWithOpenAIRag(searchQuery, message, 50, 8, contextText)
      : await queryWithPythonRag(searchQuery, message, 50, 8)
    
    // Log RAG retrieval with full details
    console.log(`\n${'='.repeat(80)}`)
    console.log(`[RAG] Retrieved ${ragResult.sources.length} chunks:`)
    ragResult.sources.forEach((chunk, idx) => {
      console.log(`\n  [${idx + 1}] ID: ${chunk.id}`)
      console.log(`      Source: ${chunk.source}`)
      console.log(`      Chunk Index: ${chunk.chunk_index}`)
      console.log(`      Rerank Score: ${chunk.rerank_score.toFixed(3)}`)
      console.log(`      Distance: ${chunk.distance.toFixed(3)}`)
      console.log(`      Text preview: ${chunk.text.substring(0, 150)}...`)
    })
    if (ragResult.timing) {
      console.log(`\n⏱️  Timing:`)
      console.log(`   Retrieve: ${ragResult.timing.retrieve_time?.toFixed(2)}s`)
      console.log(`   Rerank: ${ragResult.timing.rerank_time?.toFixed(2)}s`)
      console.log(`   LLM: ${ragResult.timing.llm_time?.toFixed(2)}s`)
      console.log(`   Total: ${ragResult.timing.total_time?.toFixed(2)}s`)
    }
    console.log(`${'='.repeat(80)}\n`)

    const assistantResponse = ragResult.answer || 'לא הצלחתי ליצור תשובה.'

    if (!assistantResponse) {
      return NextResponse.json(
        { error: 'Failed to generate response' },
        { status: 500 }
      )
    }

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

    // 10. Return response
    const response: ChatResponse = {
      message: assistantResponse,
      conversationId: conversation.id,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Chat API error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error details:', errorMessage)
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined },
      { status: 500 }
    )
  }
}

