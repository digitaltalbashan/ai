// Test RAG retrieval for 50 questions - check chunks relevance only
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
  relevance: 'good' | 'partial' | 'poor' | 'none'
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

async function retrieveChunks(question: string): Promise<ChunkResult[]> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()
    const pythonCode = `
import sys
import os
import json
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

from rag.query_improved import RagQueryEngine

try:
    engine = RagQueryEngine(top_k_retrieve=50, top_n_rerank=8)
    candidates = engine.retrieve_candidates('''${question.replace(/'/g, "\\'\\'")}''')
    sources = engine.rerank('''${question.replace(/'/g, "\\'\\'")}''', candidates)
    engine.close()
    
    result = [
        {
            "id": str(s.get("id", "")),
            "text": s.get("text", ""),
            "source": s.get("source", "unknown"),
            "chunk_index": s.get("chunk_index", s.get("order", 0)),
            "rerank_score": float(s.get("rerank_score", 0)),
            "distance": float(s.get("distance", 0))
        }
        for s in sources
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
    
    // Load DATABASE_URL from .env file
    const fs = require('fs')
    const path = require('path')
    const dotenv = require('dotenv')
    const envPath = path.join(cwd, '.env')
    let databaseUrl = process.env.DATABASE_URL
    if (fs.existsSync(envPath)) {
      const envConfig = dotenv.parse(fs.readFileSync(envPath))
      databaseUrl = databaseUrl || envConfig.DATABASE_URL
    }

    const pythonProcess = spawn(pythonPath, ['-c', pythonCode], {
      cwd: cwd,
      env: { 
        ...process.env,
        DATABASE_URL: databaseUrl || process.env.DATABASE_URL,
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
            reject(new Error(`Python process exited with code ${code}. Error: ${stderr || stdout}`))
          }
        } catch {
          reject(new Error(`Python process exited with code ${code}. Error: ${stderr || stdout}`))
        }
        return
      }

      try {
        const jsonMatch = stdout.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          resolve([])
          return
        }
        
        const result = JSON.parse(jsonMatch[0])
        if (Array.isArray(result)) {
          resolve(result)
        } else {
          resolve([])
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

function assessRelevance(question: string, chunks: ChunkResult[]): { relevance: 'good' | 'partial' | 'poor' | 'none', notes: string } {
  if (chunks.length === 0) {
    return { relevance: 'none', notes: 'לא נמצאו צ\'אנקים' }
  }

  // Extract key terms from question
  const questionLower = question.toLowerCase()
  const keyTerms = questionLower.split(/\s+/).filter(term => term.length > 2)

  // Check if chunks contain relevant information
  let relevantCount = 0
  let partialCount = 0

  for (const chunk of chunks) {
    const chunkTextLower = chunk.text.toLowerCase()
    const chunkQuestionLower = chunk.text.includes('שאלה:') ? chunk.text.split('שאלה:')[1]?.toLowerCase() || '' : ''
    
    // Check if chunk question or answer contains key terms
    const hasKeyTerms = keyTerms.some(term => 
      chunkTextLower.includes(term) || chunkQuestionLower.includes(term)
    )
    
    // Check rerank score (higher is better)
    const hasGoodScore = chunk.rerank_score > 0.5

    if (hasKeyTerms && hasGoodScore) {
      relevantCount++
    } else if (hasKeyTerms || hasGoodScore) {
      partialCount++
    }
  }

  const totalRelevant = relevantCount + partialCount
  const relevanceRatio = totalRelevant / chunks.length

  if (relevanceRatio >= 0.7 && relevantCount >= 3) {
    return { relevance: 'good', notes: `${relevantCount} רלוונטיים מאוד, ${partialCount} חלקיים` }
  } else if (relevanceRatio >= 0.5 || relevantCount >= 2) {
    return { relevance: 'partial', notes: `${relevantCount} רלוונטיים, ${partialCount} חלקיים` }
  } else if (totalRelevant > 0) {
    return { relevance: 'poor', notes: `רק ${totalRelevant} רלוונטיים מתוך ${chunks.length}` }
  } else {
    return { relevance: 'none', notes: 'אין צ\'אנקים רלוונטיים' }
  }
}

async function main() {
  console.log('🧪 בדיקת RAG Retrieval - 50 שאלות')
  console.log('='.repeat(100))
  console.log('')

  const results: TestResult[] = []
  let goodCount = 0
  let partialCount = 0
  let poorCount = 0
  let noneCount = 0

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i]
    console.log(`\n[${i + 1}/${testQuestions.length}] שאלה: "${question}"`)
    console.log('-'.repeat(100))

    try {
      const chunks = await retrieveChunks(question)
      const { relevance, notes } = assessRelevance(question, chunks)

      console.log(`📊 תוצאות: ${chunks.length} צ'אנקים נמצאו`)
      console.log(`✅ רלוונטיות: ${relevance === 'good' ? 'טובה מאוד' : relevance === 'partial' ? 'חלקית' : relevance === 'poor' ? 'נמוכה' : 'אין'}`)
      console.log(`📝 הערות: ${notes}`)

      if (chunks.length > 0) {
        console.log(`\n📚 Top 3 Chunks:`)
        chunks.slice(0, 3).forEach((chunk, idx) => {
          console.log(`\n  [${idx + 1}] ID: ${chunk.id}`)
          console.log(`      Source: ${chunk.source}`)
          console.log(`      Rerank Score: ${chunk.rerank_score.toFixed(3)}`)
          console.log(`      Distance: ${chunk.distance.toFixed(3)}`)
          const preview = chunk.text.substring(0, 150).replace(/\n/g, ' ')
          console.log(`      Preview: ${preview}...`)
        })
      }

      results.push({
        question,
        chunksFound: chunks.length,
        chunks: chunks.slice(0, 5), // Keep top 5 for analysis
        relevance,
        notes
      })

      if (relevance === 'good') goodCount++
      else if (relevance === 'partial') partialCount++
      else if (relevance === 'poor') poorCount++
      else noneCount++

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`❌ שגיאה: ${error instanceof Error ? error.message : String(error)}`)
      results.push({
        question,
        chunksFound: 0,
        chunks: [],
        relevance: 'none',
        notes: `שגיאה: ${error instanceof Error ? error.message : String(error)}`
      })
      noneCount++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(100))
  console.log('📊 סיכום תוצאות')
  console.log('='.repeat(100))
  console.log(`✅ רלוונטיות טובה מאוד: ${goodCount} (${(goodCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`⚠️  רלוונטיות חלקית: ${partialCount} (${(partialCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`❌ רלוונטיות נמוכה: ${poorCount} (${(poorCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log(`🚫 ללא צ'אנקים: ${noneCount} (${(noneCount/testQuestions.length*100).toFixed(1)}%)`)
  console.log('')

  // Detailed breakdown
  console.log('\n📋 פירוט לפי שאלות:')
  console.log('-'.repeat(100))
  results.forEach((result, idx) => {
    const icon = result.relevance === 'good' ? '✅' : result.relevance === 'partial' ? '⚠️' : result.relevance === 'poor' ? '❌' : '🚫'
    console.log(`${icon} [${idx + 1}] "${result.question}" - ${result.chunksFound} chunks - ${result.relevance} - ${result.notes}`)
  })
}

main().catch(console.error)

