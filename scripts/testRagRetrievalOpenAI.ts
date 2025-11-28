// Test RAG retrieval using OpenAI embeddings - Grade chunk quality only (no LLM call)
import { embedText } from '../src/server/openai'
import { prisma } from '../src/server/db/client'
import { spawn } from 'child_process'
import { existsSync } from 'fs'

interface ChunkResult {
  id: string
  text: string
  source: string
  chunk_index: number
  rerank_score: number
  distance: number
}

interface TestResult {
  question: string
  chunksFound: number
  chunks: ChunkResult[]
  relevance: 'excellent' | 'good' | 'partial' | 'poor' | 'none'
  notes: string
}

// Sample questions to test
const testQuestions = [
  'שלום',
  'מה זה מעגל התודעה?',
  'מה זה תודעה ראקטיבית?',
  'איך אני משחרר את המראה?',
  'מה זה חוק המראות?',
  'מה זה סרגלים?',
  'מה זה מנגנוני הישרדות?',
  'מה זה הילדה הפנימית?',
  'מה זה מיקוד שליטה פנימי?',
  'מה זה תת-מודע?',
  'איך להתמודד עם ריאקטיביות?',
  'מה ההבדל בין תודעה ראקטיבית לאקטיבית?',
  'איך לזהות דפוסי ילדות?',
  'מה זה אשמה?',
  'מה זה קנאה?',
  'איך לפרוח במלא הגודל?',
  'מה זה סקרנות?',
  'איך לעבוד עם המראה?',
  'מה זה פרונט?',
  'מה זה שיקוף?',
  'איך להתמודד עם אסטרטגיות?',
  'מה זה תודעה אקטיבית?',
  'מה זה תודעה יצירתית?',
  'איך לזהות מנגנוני הישרדות?',
  'מה זה דפוסי ילדות שנלחצים?',
  'איך לעבוד עם הילדה הפנימית?',
  'מה זה מיקוד שליטה חיצוני?',
  'איך לזהות ריאקטיביות?',
  'מה זה מראה רגשית?',
  'איך להתמודד עם אשמה?',
  'מה זה קנאה רגשית?',
  'איך לפרוח?',
  'מה זה סקרנות רגשית?',
  'איך לעבוד עם המראה הפנימית?',
  'מה זה פרונט רגשי?',
  'מה זה שיקוף רגשי?',
  'איך להתמודד עם אסטרטגיות רגשיות?',
  'מה זה תודעה?',
  'מה זה ריאקטיביות?',
  'איך לזהות מנגנונים?',
  'מה זה דפוסים?',
  'איך לעבוד עם פנימיות?',
  'מה זה שליטה?',
  'איך לזהות רגשות?',
  'מה זה מראה?',
  'איך להתמודד?',
  'מה זה אסטרטגיות?',
  'איך לפרוח רגשית?',
  'מה זה סקרנות פנימית?',
  'איך לעבוד עם עצמי?'
]

async function retrieveChunksWithOpenAI(query: string, topK: number = 50, topN: number = 8): Promise<ChunkResult[]> {
  // Step 1: Generate embedding for query using OpenAI
  const queryEmbedding = await embedText(query)
  const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`

  // Step 2: Vector search in PostgreSQL (fast retrieval)
  const searchResults = await prisma.$queryRawUnsafe<Array<{
    id: string
    text: string
    source: string | null
    chunk_index: number
    distance: number
  }>>(
    `SELECT 
      id,
      text,
      source,
      "order" as chunk_index,
      1 - (embedding <=> $1::vector) as distance
    FROM knowledge_chunks
    ORDER BY embedding <=> $1::vector
    LIMIT $2`,
    queryEmbeddingStr,
    topK
  )

  if (searchResults.length === 0) {
    return []
  }

  // Step 3: Re-rank using Python CrossEncoder for better accuracy
  const rerankedChunks = await rerankWithCrossEncoder(query, searchResults, topN)

  return rerankedChunks
}

/**
 * Re-rank chunks using CrossEncoder model (two-stage retrieval)
 * Stage 1: Fast vector search (already done)
 * Stage 2: Re-rank with cross-encoder for better precision
 */
async function rerankWithCrossEncoder(
  query: string,
  candidates: Array<{
    id: string
    text: string
    source: string | null
    chunk_index: number
    distance: number
  }>,
  topN: number
): Promise<ChunkResult[]> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()

    // Prepare chunks data for Python script
    const chunksData = candidates.map(c => ({
      id: c.id,
      text: c.text,
      source: c.source || 'unknown',
      chunk_index: c.chunk_index,
      distance: c.distance
    }))

    // Serialize chunks data to JSON string
    const chunksJson = JSON.stringify(chunksData)
    
    // Use base64 encoding to safely pass data to Python (avoids control character issues)
    const queryBase64 = Buffer.from(query, 'utf8').toString('base64')
    const chunksBase64 = Buffer.from(chunksJson, 'utf8').toString('base64')
    
    const pythonCode = `
import sys
import os
import json
import base64
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

from scripts.rerank_with_crossencoder import rerank_chunks

try:
    query = base64.b64decode('${queryBase64}').decode('utf-8')
    chunks_json = base64.b64decode('${chunksBase64}').decode('utf-8')
    chunks = json.loads(chunks_json)
    top_n = ${topN}
    
    reranked = rerank_chunks(query, chunks, top_n)
    
    result = [
        {
            "id": str(c.get("id", "")),
            "text": c.get("text", ""),
            "source": c.get("source", "unknown"),
            "chunk_index": c.get("chunk_index", 0),
            "rerank_score": float(c.get("rerank_score", 0)),
            "distance": float(c.get("distance", 0))
        }
        for c in reranked
    ]
    print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    import traceback
    error_msg = {
        "error": str(e),
        "traceback": traceback.format_exc()
    }
    print(json.dumps(error_msg, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
    `

    const venvPython = `${cwd}/venv/bin/python3`
    const pythonPath = existsSync(venvPython) ? venvPython : 'python3'
    
    const pythonProcess = spawn(pythonPath, ['-c', pythonCode], {
      cwd: cwd,
      env: { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        PATH: `${cwd}/venv/bin:${process.env.PATH}`,
      }
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        try {
          const errorMatch = (stderr || stdout).match(/\{[\s\S]*"error"[\s\S]*\}/)
          if (errorMatch) {
            const errorData = JSON.parse(errorMatch[0])
            reject(new Error(errorData.error || `Python process exited with code ${code}`))
          } else {
            // If re-ranking fails, fall back to distance-based sorting
            console.warn(`⚠️  Re-ranking failed, using distance-based sorting: ${stderr || stdout}`)
            const fallback = candidates.slice(0, topN).map((chunk) => ({
              id: chunk.id,
              text: chunk.text,
              source: chunk.source || 'unknown',
              chunk_index: chunk.chunk_index,
              rerank_score: 1 - chunk.distance, // Use similarity as rerank score
              distance: chunk.distance
            }))
            resolve(fallback)
          }
        } catch {
          // Fallback to distance-based sorting
          const fallback = candidates.slice(0, topN).map((chunk) => ({
            id: chunk.id,
            text: chunk.text,
            source: chunk.source || 'unknown',
            chunk_index: chunk.chunk_index,
            rerank_score: 1 - chunk.distance,
            distance: chunk.distance
          }))
          resolve(fallback)
        }
        return
      }

      try {
        const jsonMatch = stdout.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          // Fallback to distance-based sorting
          const fallback = candidates.slice(0, topN).map((chunk) => ({
            id: chunk.id,
            text: chunk.text,
            source: chunk.source || 'unknown',
            chunk_index: chunk.chunk_index,
            rerank_score: 1 - chunk.distance,
            distance: chunk.distance
          }))
          resolve(fallback)
          return
        }
        
        const result = JSON.parse(jsonMatch[0])
        if (Array.isArray(result)) {
          resolve(result)
        } else {
          reject(new Error(`Expected array, got: ${typeof result}`))
        }
      } catch (error) {
        // Fallback to distance-based sorting
        const fallback = candidates.slice(0, topN).map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          source: chunk.source || 'unknown',
          chunk_index: chunk.chunk_index,
          rerank_score: 1 - chunk.distance,
          distance: chunk.distance
        }))
        resolve(fallback)
      }
    })

    pythonProcess.on('error', (error) => {
      // Fallback to distance-based sorting
      console.warn(`⚠️  Failed to start Python process for re-ranking: ${error.message}`)
      const fallback = candidates.slice(0, topN).map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source || 'unknown',
        chunk_index: chunk.chunk_index,
        rerank_score: 1 - chunk.distance,
        distance: chunk.distance
      }))
      resolve(fallback)
    })
  })
}

function assessRelevance(question: string, chunks: ChunkResult[]): { 
  relevance: 'excellent' | 'good' | 'partial' | 'poor' | 'none', 
  notes: string,
  score: number,
  details: Array<{chunkId: string, relevance: string, similarity: number, hasKeyTerms: boolean}>
} {
  if (chunks.length === 0) {
    return { 
      relevance: 'none', 
      notes: 'No chunks found',
      score: 0,
      details: []
    }
  }

  // Extract key terms from question (Hebrew and common words)
  const questionLower = question.toLowerCase()
  const stopWords = ['מה', 'איך', 'למה', 'איפה', 'מתי', 'מי', 'של', 'את', 'על', 'ב', 'ל', 'ה', 'ו', 'או']
  const keyTerms = questionLower
    .split(/\s+/)
    .filter(term => term.length > 2 && !stopWords.includes(term))
    .map(term => term.replace(/[^\u0590-\u05FF\w]/g, ''))
    .filter(term => term.length > 1)

  const details: Array<{chunkId: string, relevance: string, similarity: number, hasKeyTerms: boolean}> = []
  let excellentCount = 0
  let goodCount = 0
  let partialCount = 0
  let poorCount = 0

  for (const chunk of chunks) {
    const chunkTextLower = chunk.text.toLowerCase()
    const similarity = 1 - chunk.distance
    
    // Check if chunk contains key terms
    const matchingTerms = keyTerms.filter(term => 
      chunkTextLower.includes(term) || 
      chunkTextLower.includes(term.replace(/[^\u0590-\u05FF]/g, ''))
    )
    const hasKeyTerms = matchingTerms.length > 0
    const termMatchRatio = keyTerms.length > 0 ? matchingTerms.length / keyTerms.length : 0
    
    // Grade chunk quality
    let chunkRelevance: 'excellent' | 'good' | 'partial' | 'poor' = 'poor'
    let relevanceDesc = ''
    
    if (similarity > 0.85 && termMatchRatio > 0.5) {
      chunkRelevance = 'excellent'
      excellentCount++
      relevanceDesc = `Excellent (similarity: ${similarity.toFixed(3)}, terms: ${matchingTerms.length}/${keyTerms.length})`
    } else if (similarity > 0.75 && (termMatchRatio > 0.3 || hasKeyTerms)) {
      chunkRelevance = 'good'
      goodCount++
      relevanceDesc = `Good (similarity: ${similarity.toFixed(3)}, terms: ${matchingTerms.length}/${keyTerms.length})`
    } else if (similarity > 0.65 || hasKeyTerms) {
      chunkRelevance = 'partial'
      partialCount++
      relevanceDesc = `Partial (similarity: ${similarity.toFixed(3)}, terms: ${matchingTerms.length}/${keyTerms.length})`
    } else {
      poorCount++
      relevanceDesc = `Poor (similarity: ${similarity.toFixed(3)}, terms: ${matchingTerms.length}/${keyTerms.length})`
    }
    
    details.push({
      chunkId: chunk.id,
      relevance: chunkRelevance,
      similarity,
      hasKeyTerms
    })
  }

  // Calculate overall score (0-100)
  const score = (
    (excellentCount * 100) +
    (goodCount * 75) +
    (partialCount * 50) +
    (poorCount * 25)
  ) / chunks.length

  // Determine overall relevance
  let overallRelevance: 'excellent' | 'good' | 'partial' | 'poor' | 'none'
  if (excellentCount >= 3 || score >= 85) {
    overallRelevance = 'excellent'
  } else if (goodCount >= 2 || score >= 70) {
    overallRelevance = 'good'
  } else if (partialCount > 0 || score >= 50) {
    overallRelevance = 'partial'
  } else if (score > 0) {
    overallRelevance = 'poor'
  } else {
    overallRelevance = 'none'
  }

  const notes = `Score: ${score.toFixed(1)}/100 | Excellent: ${excellentCount}, Good: ${goodCount}, Partial: ${partialCount}, Poor: ${poorCount}`

  return { relevance: overallRelevance, notes, score, details }
}

async function main() {
  console.log('🧪 RAG Retrieval Quality Test - 50 Questions')
  console.log('='.repeat(100))
  console.log('Testing chunk retrieval and quality (no LLM call)')
  console.log('='.repeat(100))
  console.log('')

  const results: TestResult[] = []
  let excellentCount = 0
  let goodCount = 0
  let partialCount = 0
  let poorCount = 0
  let noneCount = 0
  let totalScore = 0

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i]
    console.log(`\n[${i + 1}/${testQuestions.length}] Question: "${question}"`)
    console.log('-'.repeat(100))

    try {
      const chunks = await retrieveChunksWithOpenAI(question, 50, 8)
      const assessment = assessRelevance(question, chunks)

      console.log(`📊 Results: ${chunks.length} chunks found`)
      console.log(`📈 Quality Score: ${assessment.score.toFixed(1)}/100`)
      console.log(`✅ Relevance: ${assessment.relevance.toUpperCase()}`)
      console.log(`📝 Details: ${assessment.notes}`)

      if (chunks.length > 0) {
        console.log(`\n📚 Top 3 Chunks Quality:`)
        chunks.slice(0, 3).forEach((chunk, idx) => {
          const detail = assessment.details[idx]
          const similarity = (1 - chunk.distance).toFixed(3)
          console.log(`\n  [${idx + 1}] ${detail.relevance.toUpperCase()} - ID: ${chunk.id}`)
          console.log(`      Source: ${chunk.source}`)
          console.log(`      Similarity: ${similarity} (Distance: ${chunk.distance.toFixed(3)})`)
          console.log(`      Has Key Terms: ${detail.hasKeyTerms ? 'Yes' : 'No'}`)
          const preview = chunk.text.substring(0, 120).replace(/\n/g, ' ')
          console.log(`      Preview: ${preview}...`)
        })
      }

      results.push({
        question,
        chunksFound: chunks.length,
        chunks: chunks.slice(0, 5),
        relevance: assessment.relevance,
        notes: assessment.notes
      })

      totalScore += assessment.score
      if (assessment.relevance === 'excellent') excellentCount++
      else if (assessment.relevance === 'good') goodCount++
      else if (assessment.relevance === 'partial') partialCount++
      else if (assessment.relevance === 'poor') poorCount++
      else noneCount++

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
      results.push({
        question,
        chunksFound: 0,
        chunks: [],
        relevance: 'none',
        notes: `Error: ${error instanceof Error ? error.message : String(error)}`
      })
      noneCount++
    }
  }

  const averageScore = totalScore / testQuestions.length

  // Summary
  console.log('\n' + '='.repeat(100))
  console.log('📊 Final Results Summary')
  console.log('='.repeat(100))
  console.log(`⭐ Excellent Quality: ${excellentCount} (${(excellentCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`✅ Good Quality: ${goodCount} (${(goodCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`⚠️  Partial Quality: ${partialCount} (${(partialCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`❌ Poor Quality: ${poorCount} (${(poorCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`🚫 No Chunks: ${noneCount} (${(noneCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log('')
  console.log(`📈 Average Quality Score: ${averageScore.toFixed(1)}/100`)
  console.log('')

  // Detailed breakdown
  console.log('\n📋 Detailed Breakdown by Question:')
  console.log('-'.repeat(100))
  results.forEach((result, idx) => {
    const icon = result.relevance === 'excellent' ? '⭐' : 
                 result.relevance === 'good' ? '✅' : 
                 result.relevance === 'partial' ? '⚠️' : 
                 result.relevance === 'poor' ? '❌' : '🚫'
    const scoreMatch = result.notes.match(/Score: ([\d.]+)/)
    const score = scoreMatch ? scoreMatch[1] : '0'
    console.log(`${icon} [${idx + 1}] "${result.question}" - ${result.chunksFound} chunks - ${result.relevance.toUpperCase()} - Score: ${score}`)
  })

  // Quality distribution
  console.log('\n📊 Quality Distribution:')
  console.log('-'.repeat(100))
  const scoreRanges = {
    '90-100 (Excellent)': 0,
    '70-89 (Good)': 0,
    '50-69 (Partial)': 0,
    '25-49 (Poor)': 0,
    '0-24 (Very Poor)': 0
  }
  
  results.forEach(result => {
    const scoreMatch = result.notes.match(/Score: ([\d.]+)/)
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1])
      if (score >= 90) scoreRanges['90-100 (Excellent)']++
      else if (score >= 70) scoreRanges['70-89 (Good)']++
      else if (score >= 50) scoreRanges['50-69 (Partial)']++
      else if (score >= 25) scoreRanges['25-49 (Poor)']++
      else scoreRanges['0-24 (Very Poor)']++
    }
  })
  
  Object.entries(scoreRanges).forEach(([range, count]) => {
    const percentage = (count / testQuestions.length * 100).toFixed(1)
    console.log(`   ${range}: ${count} questions (${percentage}%)`)
  })

  await prisma.$disconnect()
}

main().catch(console.error)

