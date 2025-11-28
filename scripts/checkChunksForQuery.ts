// Quick script to check which chunks are returned for a specific query
// Usage: pnpm tsx scripts/checkChunksForQuery.ts "מהי מצדה?"
import { embedText } from '../src/server/openai'
import { prisma } from '../src/server/db/client'
import { spawn } from 'child_process'
import { existsSync } from 'fs'

const query = process.argv[2] || 'מהי מצדה?'

async function retrieveChunks(query: string) {
  // Step 1: Generate embedding
  const queryEmbedding = await embedText(query)
  const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`

  // Step 2: Vector search (top 50 candidates)
  const candidates = await prisma.$queryRawUnsafe<Array<{
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
      embedding <=> $1::vector AS distance
    FROM knowledge_chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT 50`,
    queryEmbeddingStr
  )

  if (candidates.length === 0) {
    return []
  }

  // Step 3: Re-rank using Python CrossEncoder
  try {
    const reranked = await rerankWithCrossEncoder(query, candidates, 8)
    return reranked
  } catch (error) {
    console.warn('⚠️  Re-ranking failed, using distance-based sorting:', error)
    return candidates.slice(0, 8).map(c => ({
      id: c.id,
      text: c.text,
      source: c.source || 'unknown',
      chunk_index: c.chunk_index,
      rerank_score: 1 - c.distance,
      distance: c.distance
    }))
  }
}

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
): Promise<Array<{
  id: string
  text: string
  source: string
  chunk_index: number
  rerank_score: number
  distance: number
}>> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()
    const chunksData = candidates.map(c => ({
      id: c.id,
      text: c.text,
      source: c.source || 'unknown',
      chunk_index: c.chunk_index,
      distance: c.distance
    }))

    const chunksJson = JSON.stringify(chunksData)
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
        reject(new Error(`Python process exited with code ${code}. Error: ${stderr || stdout}`))
        return
      }

      try {
        const jsonMatch = stdout.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          reject(new Error(`No JSON array found in Python output`))
          return
        }
        
        const result = JSON.parse(jsonMatch[0])
        if (Array.isArray(result)) {
          resolve(result)
        } else {
          reject(new Error(`Expected array, got: ${typeof result}`))
        }
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error instanceof Error ? error.message : String(error)}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`))
    })
  })
}

async function main() {
  console.log(`🔍 Query: "${query}"`)
  console.log('='.repeat(100))
  console.log('')
  
  try {
    const chunks = await retrieveChunks(query)
    
    console.log(`📚 Found ${chunks.length} chunks (after re-ranking):`)
    console.log('')
    
    chunks.forEach((chunk, idx) => {
      const similarity = (1 - chunk.distance).toFixed(3)
      console.log(`[${idx + 1}] Similarity: ${similarity} | Rerank Score: ${chunk.rerank_score?.toFixed(3) || 'N/A'}`)
      console.log(`    ID: ${chunk.id}`)
      console.log(`    Source: ${chunk.source}`)
      console.log(`    Chunk Index: ${chunk.chunk_index}`)
      console.log(`    Distance: ${chunk.distance.toFixed(3)}`)
      console.log(`    Text (FULL):`)
      console.log(`    ${'─'.repeat(96)}`)
      console.log(`    ${chunk.text}`)
      console.log(`    ${'─'.repeat(96)}`)
      console.log('')
    })
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

