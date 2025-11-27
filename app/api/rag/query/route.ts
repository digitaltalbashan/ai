import { NextRequest, NextResponse } from 'next/server'
import { queryWithCrossEncoder } from '@/src/server/vector/queryWithCrossEncoder'

/**
 * RAG Query API endpoint
 * Uses CrossEncoder for improved accuracy
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, topK = 40, topN = 8 } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

    // Use CrossEncoder query engine
    const result = await queryWithCrossEncoder(question, topK, topN)

    return NextResponse.json({
      question,
      answer: result.answer || 'לא נמצאו קטעים רלוונטיים.',
      sources: result.sources.map(s => ({
        id: s.id,
        source: s.source,
        chunk_index: s.chunk_index,
        text_preview: s.text.substring(0, 200) + '...',
        rerank_score: s.rerank_score,
        distance: s.distance
      })),
      total_sources: result.sources.length
    })
  } catch (error: any) {
    console.error('RAG query error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

