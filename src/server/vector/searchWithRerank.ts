// Improved RAG Search with Re-ranking
// Strategy: Vector Search → Re-ranking (CrossEncoder) → Top N chunks
import { prisma } from '@/src/server/db/client'
import { embedText } from '@/src/server/openai'

// Note: For production, you'd want to use a proper CrossEncoder library
// For now, we'll use a hybrid approach with improved scoring

interface ChunkWithScore {
  id: string
  text: string
  metadata: any
  source?: string
  lesson?: string
  distance: number
  relevanceScore: number
}

/**
 * Extract key terms from query for metadata matching
 */
function extractKeyTerms(query: string): string[] {
  const courseTerms = [
    'מעגל התודעה',
    'תודעה ראקטיבית',
    'תודעה אקטיבית',
    'תודעה יצירתית',
    'תת מודע',
    'רצון חופשי',
    'פחד',
    'מציאות',
    'שחיקה',
    'תקיעות',
    'תודעה',
    'מנהיגות תודעתית',
    'מעגל',
    'התודעה'
  ]
  
  const terms: string[] = []
  const queryLower = query.toLowerCase()
  
  for (const term of courseTerms) {
    if (queryLower.includes(term.toLowerCase())) {
      terms.push(term)
    }
  }
  
  if (queryLower.includes('מעגל') && !terms.includes('מעגל התודעה')) {
    terms.push('מעגל התודעה')
  }
  if (queryLower.includes('התודעה') && !terms.includes('מעגל התודעה')) {
    terms.push('מעגל התודעה')
  }
  
  return terms
}

/**
 * Calculate relevance score between query and chunk
 * Improved scoring with better weights and general chunk penalty
 */
function calculateRelevanceScore(
  query: string,
  chunkText: string,
  metadata: any
): number {
  const queryLower = query.toLowerCase()
  const textLower = chunkText.toLowerCase()
  
  let score = 0
  
  // 0. Penalty for general chunks (marked as is_general in metadata)
  if (metadata?.is_general === true) {
    score -= 5  // Penalty for overly general chunks
  }
  
  // 1. Exact phrase match (highest weight)
  if (textLower.includes(queryLower)) {
    score += 15  // Increased from 10
  }
  
  // 1.5. Partial phrase match (substring of query)
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
  if (queryWords.length > 1) {
    // Check if most query words appear together
    const queryPhrase = queryWords.slice(0, Math.min(3, queryWords.length)).join(' ')
    if (textLower.includes(queryPhrase)) {
      score += 10
    }
  }
  
  // 2. Word overlap (count matching words) - improved
  const matchingWords = queryWords.filter(w => textLower.includes(w)).length
  const wordOverlap = matchingWords / Math.max(1, queryWords.length)
  score += wordOverlap * 8  // Increased from 5
  
  // 2.5. Important word matches (course-specific terms)
  const importantTerms = [
    'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
    'תת מודע', 'רצון חופשי', 'מציאות', 'שחיקה', 'תקיעות'
  ]
  for (const term of importantTerms) {
    if (queryLower.includes(term.toLowerCase()) && textLower.includes(term.toLowerCase())) {
      score += 5  // Bonus for matching important terms
    }
  }
  
  // 3. Metadata match - improved weights
  const topic = (metadata?.topic || '').toLowerCase()
  const concepts = (metadata?.key_concepts || []).map((c: string) => c.toLowerCase())
  
  // Topic match is very important
  if (topic) {
    const topicMatch = queryWords.filter(w => topic.includes(w)).length
    if (topicMatch > 0) {
      score += topicMatch * 4  // Increased from 3
    }
  }
  
  // Concept match is important
  if (concepts.length > 0) {
    const conceptMatches = concepts.filter((c: string) => 
      queryWords.some(w => c.includes(w))
    ).length
    if (conceptMatches > 0) {
      score += conceptMatches * 3  // Increased from 2
    }
  }
  
  // 4. Position in text (earlier mentions are more important)
  const firstMatch = textLower.indexOf(queryLower.substring(0, Math.min(20, queryLower.length)))
  if (firstMatch !== -1 && firstMatch < 500) {
    const positionScore = Math.max(0, 1 - firstMatch / 500) * 3  // Increased from 2
    score += positionScore
  }
  
  // 5. Text length penalty (very long chunks might be less focused)
  if (chunkText.length > 2000) {
    score -= 2
  }
  
  // 6. Source quality bonus (prefer certain sources)
  const source = (metadata?.source || '').toLowerCase()
  if (source.includes('lesson1') || source.includes('שיעור')) {
    score += 1  // Slight bonus for lesson content
  }
  
  return Math.max(0, score)  // Ensure non-negative
}

/**
 * Improved RAG Search with Re-ranking
 * 
 * Strategy:
 * 1. Vector Search: Retrieve top_k=30-50 candidates
 * 2. Re-ranking: Score and rank by relevance
 * 3. Return top_n=5-10 most relevant chunks
 * 
 * @param query - User question
 * @param topK - Number of candidates to retrieve (30-50 recommended)
 * @param topN - Number of final chunks to return (5-10 recommended)
 */
export async function searchKnowledgeWithRerank(
  query: string,
  topK: number = 40,
  topN: number = 8
): Promise<Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string; relevanceScore?: number }>> {
  
  // Step 1: Vector Search - Retrieve candidates
  const queryEmbedding = await embedText(query)
  const embeddingStr = `[${queryEmbedding.join(',')}]`
  
  // Get more candidates than needed for re-ranking
  const candidates = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      text: string
      metadata: any
      source: string | null
      lesson: string | null
      distance: number
    }>
  >(
    `SELECT 
      id,
      text,
      metadata,
      source,
      lesson,
      embedding <=> $1::vector AS distance
    FROM knowledge_chunks
    ORDER BY embedding <=> $1::vector
    LIMIT $2`,
    embeddingStr,
    topK
  )
  
  if (candidates.length === 0) {
    return []
  }
  
  // Step 2: Re-ranking - Use CrossEncoder via Python
  // Try to use Python CrossEncoder first, fallback to hybrid scoring
  let topChunks
  try {
    const { queryWithCrossEncoder } = await import('./queryWithCrossEncoder')
    const result = await queryWithCrossEncoder(query, topK, topN)
    // Convert result format to match expected format
    // Need to get full metadata from candidates
    const candidateMap = new Map(candidates.map(c => [c.id, c]))
    topChunks = result.sources.map((s: any) => {
      const original = candidateMap.get(s.id) || candidates[0]
      return {
        id: s.id,
        text: s.text,
        metadata: original.metadata || {},
        source: s.source,
        lesson: original.lesson || undefined,
        distance: s.distance,
        score: s.rerank_score
      }
    })
  } catch (error) {
    // Fallback to hybrid scoring if Python engine fails
    console.warn('CrossEncoder via Python failed, using hybrid scoring:', error)
    const { rerankWithHybridScoring } = await import('./rerankWithCrossEncoder')
    const scoredChunks = rerankWithHybridScoring(query, candidates.map(c => ({
      ...c,
      source: c.source || undefined,
      lesson: c.lesson || undefined
    })))
    topChunks = scoredChunks.slice(0, topN)
  }
  
  return topChunks.map((chunk) => ({
    id: chunk.id,
    text: chunk.text,
    metadata: chunk.metadata,
    source: chunk.source ?? undefined,
    lesson: chunk.lesson ?? undefined,
    relevanceScore: chunk.score
  }))
}


