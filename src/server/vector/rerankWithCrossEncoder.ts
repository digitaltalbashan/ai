// Re-ranking using Python CrossEncoder (via API call)
// Since CrossEncoder requires Python, we'll call a Python service
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

interface ChunkWithScore {
  id: string
  text: string
  metadata: any
  source?: string
  lesson?: string
  distance: number
  relevanceScore: number
  crossEncoderScore?: number
}

/**
 * Re-rank chunks using CrossEncoder via Python script
 * Falls back to hybrid scoring if Python is not available
 */
export async function rerankWithCrossEncoder(
  query: string,
  chunks: Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string; distance: number }>
): Promise<Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string; score: number }>> {
  
  if (chunks.length === 0) {
    return []
  }
  
  // Use improved hybrid scoring (optimized for Hebrew)
  return rerankWithHybridScoring(query, chunks)
}

/**
 * Estimate tokens
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Improved hybrid re-ranking (current implementation)
 * Export for use in searchWithRerank
 */
export function rerankWithHybridScoring(
  query: string,
  chunks: Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string; distance: number }>
): Array<{ id: string; text: string; metadata: any; source?: string; lesson?: string; score: number }> {
  
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
  
  // Calculate average distance
  const distances = chunks.map(c => c.distance)
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  
  const scored = chunks.map((chunk, order) => {
    const text = chunk.text.toLowerCase()
    const metadata = chunk.metadata || {}
    
    let score = 0
    
    // 1. Exact phrase match (highest weight) - increased
    if (text.includes(queryLower)) {
      score += 30  // Increased from 20
    }
    
    // 1.5. Near-exact match (query with small variations)
    const queryWordsJoined = queryWords.join(' ')
    if (text.includes(queryWordsJoined) || 
        (queryWords.length > 2 && text.includes(queryWords.slice(0, -1).join(' ')))) {
      score += 20
    }
    
    // 2. Partial phrase match - improved
    if (queryWords.length > 1) {
      // Try different phrase lengths
      for (let len = Math.min(4, queryWords.length); len >= 2; len--) {
        const queryPhrase = queryWords.slice(0, len).join(' ')
        if (text.includes(queryPhrase)) {
          score += 15 + (len - 2) * 2  // Bonus for longer phrases
          break
        }
      }
    }
    
    // 3. Word overlap - improved with position weighting
    const matchingWords = queryWords.filter(w => text.includes(w)).length
    const wordOverlap = matchingWords / Math.max(1, queryWords.length)
    score += wordOverlap * 12  // Increased from 10
    
    // 3.5. Consecutive word matches (bonus)
    let consecutiveMatches = 0
    for (let i = 0; i < queryWords.length - 1; i++) {
      const word1 = queryWords[i]
      const word2 = queryWords[i + 1]
      if (text.includes(word1) && text.includes(word2)) {
        // Check if they appear close together
        const idx1 = text.indexOf(word1)
        const idx2 = text.indexOf(word2, idx1)
        if (idx2 !== -1 && idx2 - idx1 < 50) {
          consecutiveMatches++
        }
      }
    }
    if (consecutiveMatches > 0) {
      score += consecutiveMatches * 3
    }
    
    // 4. Important terms match - improved
    const importantTerms = [
      'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
      'תת מודע', 'רצון חופשי', 'מציאות', 'שחיקה', 'תקיעות',
      'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות'
    ]
    for (const term of importantTerms) {
      const termLower = term.toLowerCase()
      if (queryLower.includes(termLower) && text.includes(termLower)) {
        // Bonus for exact term match
        if (text.includes(term)) {
          score += 10  // Increased from 8
        } else {
          score += 6
        }
      }
    }
    
    // 5. Metadata match
    const topic = (metadata.topic || '').toLowerCase()
    const concepts = (metadata.key_concepts || []).map((c: string) => c.toLowerCase())
    
    if (topic) {
      const topicMatch = queryWords.filter(w => topic.includes(w)).length
      if (topicMatch > 0) {
        score += topicMatch * 5
      }
    }
    
    if (concepts.length > 0) {
      const conceptMatches = concepts.filter((c: string) => 
        queryWords.some(w => c.includes(w))
      ).length
      if (conceptMatches > 0) {
        score += conceptMatches * 4
      }
    }
    
    // 6. Position in text
    const firstMatch = text.indexOf(queryLower.substring(0, Math.min(20, queryLower.length)))
    if (firstMatch !== -1 && firstMatch < 500) {
      const positionScore = Math.max(0, 1 - firstMatch / 500) * 4
      score += positionScore
    }
    
    // 7. Chunk type bonuses/penalties
    if (metadata.chunk_type === 'intro' && order <= 5) {
      score += 2  // Slight bonus for intro chunks in early positions
    }
    
    if (metadata.chunk_type === 'summary') {
      score += 1  // Slight bonus for summaries
    }
    
    // 8. Penalties - significantly increased
    if (metadata.is_general === true) {
      score -= 15  // Much higher penalty for general chunks
    }
    
    if (metadata.chunk_type === 'general') {
      score -= 12  // Much higher penalty
    }
    
    if (chunk.text.length > 2000) {
      score -= 6  // Increased penalty for very long chunks
    }
    
    // 8.5. Penalty for chunks that appear too frequently (if we track this)
    // This will be handled by the re-ranking logic
    
    // 9. Distance penalty (normalized) - minimal weight (relevance is more important)
    const normalizedDistance = Math.min(1, chunk.distance / 2.0)
    const distancePenalty = normalizedDistance * 2  // Further reduced
    
    // 10. Outlier penalty - increased
    const distanceFromAvg = Math.abs(chunk.distance - avgDistance)
    const outlierPenalty = distanceFromAvg > avgDistance * 0.5 ? 6 : 0
    
    // 10.5. Penalty for chunks that match too many queries (general chunks)
    // If chunk appears in many different questions, it's probably too general
    // We'll use a heuristic: if chunk has very common words, penalize
    const chunkWords = chunk.text.split(/\s+/).filter(Boolean)
    const commonPhrases = ['זה', 'של', 'את', 'על', 'או', 'אם', 'כי', 'אז', 'גם', 'יותר', 'אנחנו', 'אני']
    const commonWordRatio = chunkWords.filter(w => commonPhrases.includes(w.toLowerCase())).length / Math.max(1, chunkWords.length)
    if (commonWordRatio > 0.4) {
      score -= 8  // Penalty for chunks with too many common words
    }
    
    // 11. Token count bonus (prefer chunks in optimal range 200-400 tokens)
    const tokenCount = metadata.token_count || estimateTokens(chunk.text)
    if (tokenCount >= 200 && tokenCount <= 400) {
      score += 2  // Bonus for optimal chunk size
    } else if (tokenCount < 100 || tokenCount > 500) {
      score -= 2  // Penalty for chunks outside optimal range
    }
    
    const finalScore = score - distancePenalty - outlierPenalty
    
    return {
      ...chunk,
      score: Math.max(0, finalScore)
    }
  })
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)
  
  return scored
}

