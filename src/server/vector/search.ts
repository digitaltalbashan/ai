// Vector search utilities using pgvector
// Now uses improved search with re-ranking
import { prisma } from '@/src/server/db/client'
import { embedText } from '@/src/server/openai'

/**
 * Extract key terms from query for metadata matching
 */
function extractKeyTerms(query: string): string[] {
  // Common Hebrew terms related to the course
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
  
  // Check for exact matches
  for (const term of courseTerms) {
    if (queryLower.includes(term.toLowerCase())) {
      terms.push(term)
    }
  }
  
  // Also check for partial matches (e.g., "מעגל" in "מעגל התודעה")
  if (queryLower.includes('מעגל') && !terms.includes('מעגל התודעה')) {
    terms.push('מעגל התודעה')
  }
  if (queryLower.includes('התודעה') && !terms.includes('מעגל התודעה')) {
    terms.push('מעגל התודעה')
  }
  
  return terms
}

/**
 * Search knowledge chunks using improved RAG strategy:
 * 1. Vector Search: Retrieve top_k=30-50 candidates
 * 2. Re-ranking: Score and rank by relevance
 * 3. Return top_n=5-10 most relevant chunks
 * 
 * This uses the improved searchWithRerank function for better accuracy
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5
): Promise<Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string }>> {
  // Import dynamically to avoid circular dependency
  const { searchKnowledgeWithRerank } = await import('./searchWithRerank')
  
  // Use improved search with re-ranking
  // Retrieve 40 candidates, return top K
  const isConceptQuestion = query.includes('מה זה') || query.includes('תסביר') || query.includes('מה המשמעות')
  const retrieveK = isConceptQuestion ? 50 : 40
  const returnK = Math.min(Math.max(topK, 3), 10)
  
  const results = await searchKnowledgeWithRerank(query, retrieveK, returnK)
  
  // Remove relevanceScore for backward compatibility
  return results.map(({ relevanceScore, ...rest }) => rest)
}

/**
 * Search user memories by semantic similarity
 * Only searches memories for a specific user
 */
export async function searchUserMemories(
  userId: string,
  query: string,
  topK: number = 5
): Promise<Array<{ id: string; summary: string; memoryType: string; createdAt: Date }>> {
  // Generate embedding for the query
  const queryEmbedding = await embedText(query)

  // Convert to PostgreSQL vector format
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  // Search only within this user's memories
  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      summary: string
      memoryType: string
      createdAt: Date
      distance: number
    }>
  >(
    `SELECT 
      id,
      summary,
      "memoryType",
      "createdAt",
      embedding <=> $1::vector AS distance
    FROM user_memories
    WHERE "userId" = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3`,
    embeddingStr,
    userId,
    topK
  )

  return results.map((r) => ({
    id: r.id,
    summary: r.summary,
    memoryType: r.memoryType,
    createdAt: r.createdAt,
  }))
}

