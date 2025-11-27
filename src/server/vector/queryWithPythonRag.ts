/**
 * Python RAG Query with llama.cpp (Best results)
 * Uses the improved Python RAG system with CrossEncoder re-ranking and llama.cpp LLM
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'

export interface PythonRagResult {
  answer: string
  sources: Array<{
    id: string
    text: string
    source: string
    chunk_index: number
    rerank_score: number
    distance: number
  }>
  timing?: {
    retrieve_time: number
    rerank_time: number
    llm_time: number
    total_time: number
  }
}

export async function queryWithPythonRag(
  searchQuery: string,
  question: string,
  topK: number = 50,
  topN: number = 8
): Promise<PythonRagResult> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()
    const pythonCode = `
import sys
import os
import json
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

# Always use llama.cpp + GGUF
os.environ.setdefault('USE_LLAMA_CPP', 'true')

from rag.query_improved import RagQueryEngine, call_llm_default

try:
    engine = RagQueryEngine(top_k_retrieve=${topK}, top_n_rerank=${topN})
    answer, sources, timing_info = engine.answer(
        search_query='''${searchQuery.replace(/'/g, "\\'\\'")}''',
        question='''${question.replace(/'/g, "\\'\\'")}''',
        llm_callable=call_llm_default,
        measure_time=True
    )
    engine.close()
    
    result = {
        "answer": answer,
        "sources": [
            {
                "id": str(s.get("id", "")),
                "text": s.get("text", ""),
                "source": s.get("source", "unknown"),
                "chunk_index": s.get("chunk_index", s.get("order", 0)),
                "rerank_score": float(s.get("rerank_score", 0)),
                "distance": float(s.get("distance", 0))
            }
            for s in sources
        ],
        "timing": timing_info if timing_info else None
    }
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

    // Use venv Python if available, otherwise use system python3
    const venvPython = `${cwd}/venv/bin/python3`
    const pythonPath = existsSync(venvPython) ? venvPython : 'python3'
    
    const pythonProcess = spawn(pythonPath, ['-c', pythonCode], {
      cwd: cwd,
      env: { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        USE_LLAMA_CPP: 'true',  // Always use llama.cpp + GGUF
        PATH: `${cwd}/venv/bin:${process.env.PATH}`, // Add venv to PATH
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
          // Try to parse error from stderr or stdout
          const errorMatch = (stderr || stdout).match(/\{[\s\S]*"error"[\s\S]*\}/)
          if (errorMatch) {
            const errorData = JSON.parse(errorMatch[0])
            reject(new Error(errorData.error || `Python process exited with code ${code}`))
          } else {
            reject(new Error(`Python process exited with code ${code}. Error: ${stderr || stdout}`))
          }
        } catch {
          reject(new Error(`Python process exited with code ${code}. Error: ${stderr || stdout}`))
        }
        return
      }

      try {
        // Extract JSON from stdout (may contain print statements before JSON)
        // Look for JSON object in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          reject(new Error(`No JSON found in Python output. Output: ${stdout.substring(0, 500)}`))
          return
        }
        
        const result = JSON.parse(jsonMatch[0])
        if (result.error) {
          reject(new Error(result.error))
          return
        }
        resolve(result as PythonRagResult)
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error instanceof Error ? error.message : String(error)}\nOutput: ${stdout.substring(0, 500)}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`))
    })
  })
}

