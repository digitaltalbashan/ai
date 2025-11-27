/**
 * RAG Query with CrossEncoder Re-ranking
 * Calls Python query engine for improved accuracy
 */
import { spawn } from 'child_process'
import path from 'path'

interface QueryResult {
  answer: string
  sources: Array<{
    id: string
    text: string
    source: string
    chunk_index: number
    rerank_score: number
    distance: number
  }>
}

export async function queryWithCrossEncoder(
  question: string,
  topK: number = 50,
  topN: number = 8
): Promise<{ sources: QueryResult['sources'] }> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()
    const pythonCode = `
import sys
import os
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

from rag.query_improved import RagQueryEngine
import json

try:
    engine = RagQueryEngine(top_k_retrieve=${topK}, top_n_rerank=${topN})
    candidates = engine.retrieve_candidates('''${question.replace(/'/g, "\\'\\'")}''')
    sources = engine.rerank('''${question.replace(/'/g, "\\'\\'")}''', candidates)
    engine.close()
    
    result = {
        "sources": [
            {
                "id": s["id"],
                "text": s["text"],
                "source": s["source"],
                "chunk_index": s.get("chunk_index", s.get("order", 0)),
                "rerank_score": s.get("rerank_score", 0),
                "distance": s.get("distance", 0)
            }
            for s in sources
        ]
    }
    print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
    `

    const pythonProcess = spawn('python3', ['-c', pythonCode], {
      cwd: cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
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
        reject(new Error(`Python process exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) {
          reject(new Error(result.error))
          return
        }
        resolve(result)
      } catch (e) {
        reject(new Error(`Failed to parse result: ${e}. stdout: ${stdout.substring(0, 200)}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error}`))
    })
  })
}
