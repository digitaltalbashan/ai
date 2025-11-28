/**
 * RAG Query with OpenAI API
 * Uses Python RAG for retrieval, but OpenAI API for LLM
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { chatCompletion, embedText } from '../openai'
import { prisma } from '@/src/server/db/client'

export interface OpenAIRagResult {
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

export async function queryWithOpenAIRag(
  searchQuery: string,
  question: string,
  topK: number = 50,
  topN: number = 8,
  userContext?: string
): Promise<OpenAIRagResult> {
  const startTime = Date.now()
  
  // Step 1: Use Python RAG for retrieval and re-ranking only
  const retrievalStart = Date.now()
  const chunks = await retrieveChunksWithPython(searchQuery, topK, topN)
  const retrieveTime = (Date.now() - retrievalStart) / 1000
  
  if (!chunks || chunks.length === 0) {
    return {
      answer: 'לא מצאתי מידע רלוונטי בחומרי הקורס.',
      sources: [],
      timing: {
        retrieve_time: retrieveTime,
        rerank_time: 0,
        llm_time: 0,
        total_time: (Date.now() - startTime) / 1000,
      },
    }
  }
  
  // Step 2: Build prompt with context
  const llmStart = Date.now()
  const knowledgeChunks = chunks.map(chunk => ({
    id: chunk.id,
    text: chunk.text,
    source: chunk.source,
    chunk_index: chunk.chunk_index,
  }))
  
  // Build messages for OpenAI using the prompt builder
  // Format: system message with context + user question
  const contextText = knowledgeChunks.map((chunk, idx) => 
    `[מקור ${idx + 1}] ${chunk.source}:\n${chunk.text}`
  ).join('\n\n')
  
  // Log full context that will be sent to OpenAI
  console.log(`\n${'='.repeat(100)}`)
  console.log(`📤 קונטקסט מלא שנשלח ל-OpenAI:`)
  console.log(`${'='.repeat(100)}`)
  
  const userContextSection = userContext ? `\n\n${userContext}` : ''
  
  const systemPrompt = `אתה טל בשן – מרצה ומטפל רגשי, ואתה עונה תמיד בסגנון הדיבור האותנטי שלו כפי שהוא נשמע בשיעורים ובהקלטות.

## כללי עבודה בסיסיים:

1. אתה **עונה רק מתוך הצ'אנקים והדוגמאות** שאני מספק.  
   אין להמציא ידע, אין לשער, ואין לענות מעבר למה שיש בקונטקסט.

2. אם אין מספיק מידע כדי לענות — אתה אומר זאת בכנות, בצורה עדינה:  
   "לא מצאתי תשובה מדויקת בקטעים שקיבלתי. אם תרצה, אוכל להציע כיוון כללי."

3. תמיד תענה בעברית טבעית.

## 1. טון ועמדה

- הטון חם, אנושי, לא שיפוטי, בגובה העיניים.
- לעיתים הומור עדין, במיוחד עצמי, לשחרור מתח.
- אווירה של "בואו נחשוב יחד", לא סמכותיות נוקשה.

## 2. מבנה תשובה קבוע (5 שלבים)

עליך לשמור על מבנה תשובה בעל 5 שלבים:

**שלב 1: קבלה ושיקוף קצר של השואל/ת**

ביטויים כמו "אוקיי", "נהדר", "מעניין מה שאת אומרת", "אני מבין".

**שלב 2: העמקת הפרספקטיבה באמצעות מושגים מרכזיים**

שימוש תדיר ומדויק במונחים הבאים:

- חוק המראות
- סרגלים / ערכים
- ריאקטיביות
- מנגנוני הישרדות
- הילדה/הילד הפנימי
- מיקוד שליטה פנימי
- תת־מודע
- דפוסי ילדות שנלחצים

**שלב 3: הסבר מסודר ורציף בצורת פירוק לוגי**

דוגמא: "קודם כל…", "ואז…", "ומה זה אומר בפועל?".

חשוב להביא דוגמה יומיומית אחת לפחות (כביש, זוגיות, עבודה, שיחה עם הורה וכו').

**שלב 4: ריכוך אשמה וחמלה עצמית**

הדגשה: "זו לא תקלה בך", "זה מנגנון הישרדות שהיה חייב להגן עלייך".

**שלב 5: משפט מסכם חזק שאפשר לזכור**

דוגמאות בסגנון:

- "אנחנו לא מוחקים את הילדה – רק מושיבים את המבוגר ליד ההגה."
- "המציאות רק מציפה את מה שכבר כואב בפנים."
- "כל ריאקציה היא מראה למקום שמבקש ריפוי."

## 3. סגנון לשוני

- עברית יומיומית ולא קלינית.
- לפעמים מילה באנגלית ("We are reacting").
- הומור רך, דיבור חופשי: "בואו נגיד ככה…", "תלי תילים של סיפור".
- לעולם אינך מדבר בהתנשאות.

## 4. צורת תוכן

- תשובות ברורות, נקיות, עם עומק רגשי.
- לא להעתיק תשובות קיימות – לייצר תשובה חדשה ברוח הסגנון והדוגמאות.
- לשמור על אינטימיות, אמפתיה ודיוק.

קונטקסט מחומרי הקורס:
${contextText}${userContextSection}`
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: question
    }
  ]
  
  // Log full system prompt
  console.log(`\n[SYSTEM PROMPT - FULL]:`)
  console.log(`${'─'.repeat(96)}`)
  console.log(systemPrompt)
  console.log(`${'─'.repeat(96)}`)
  
  // Log user question
  console.log(`\n[USER QUESTION]:`)
  console.log(`${'─'.repeat(96)}`)
  console.log(question)
  console.log(`${'─'.repeat(96)}`)
  
  // Log model and parameters
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const temperature = 0.3
  const maxTokens = 2000
  
  console.log(`\n[OPENAI API PARAMETERS]:`)
  console.log(`   Model: ${model}`)
  console.log(`   Temperature: ${temperature}`)
  console.log(`   Max Tokens: ${maxTokens}`)
  console.log(`   Messages Count: ${messages.length}`)
  console.log(`   System Prompt Length: ${systemPrompt.length} characters`)
  console.log(`   Context Length: ${contextText.length} characters`)
  console.log(`   Total Prompt Length: ${systemPrompt.length + question.length} characters`)
  console.log(`${'='.repeat(100)}\n`)
  
  // Step 3: Call OpenAI API
  try {
    const response = await chatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 2000,
    })
    
    const llmTime = (Date.now() - llmStart) / 1000
    const answer = response.choices[0]?.message?.content || 'לא הצלחתי ליצור תשובה.'
    
    return {
      answer,
      sources: chunks,
      timing: {
        retrieve_time: retrieveTime,
        rerank_time: 0, // Already included in retrieval
        llm_time: llmTime,
        total_time: (Date.now() - startTime) / 1000,
      },
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Retrieve chunks using OpenAI embeddings (TypeScript-based, no Python)
 * This matches the 1536-dimensional embeddings in the database
 */
async function retrieveChunksWithPython(
  searchQuery: string,
  topK: number,
  topN: number
): Promise<Array<{
  id: string
  text: string
  source: string
  chunk_index: number
  rerank_score: number
  distance: number
}>> {
  // Step 1: Generate query embedding using OpenAI (1536 dimensions)
  const queryEmbedding = await embedText(searchQuery)
  const embeddingStr = `[${queryEmbedding.join(',')}]`
  
  // Step 2: Vector search in PostgreSQL
  const candidates = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      text: string
      source: string | null
      lesson: string | null
      order: number | null
      distance: number
    }>
  >(
    `SELECT 
      id,
      text,
      source,
      lesson,
      "order",
      embedding <=> $1::vector AS distance
    FROM knowledge_chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2`,
    embeddingStr,
    topK
  )
  
  if (candidates.length === 0) {
    return []
  }
  
  // Step 3: Re-rank using Python CrossEncoder
  try {
    const rerankedChunks = await rerankWithCrossEncoder(searchQuery, candidates, topN)
    return rerankedChunks.map(chunk => ({
      id: chunk.id,
      text: chunk.text,
      source: chunk.source || 'unknown',
      chunk_index: chunk.chunk_index || 0,
      rerank_score: chunk.rerank_score || 0,
      distance: chunk.distance || 0
    }))
  } catch (error) {
    console.warn('CrossEncoder re-ranking failed, using distance-based sorting:', error)
    // Fallback: return top N by distance
    return candidates.slice(0, topN).map((c, idx) => ({
      id: c.id,
      text: c.text,
      source: c.source || 'unknown',
      chunk_index: c.order || 0,
      rerank_score: 1 - c.distance, // Convert distance to score
      distance: c.distance
    }))
  }
}

/**
 * Re-rank chunks using Python CrossEncoder
 */
async function rerankWithCrossEncoder(
  query: string,
  candidates: Array<{
    id: string
    text: string
    source: string | null
    lesson: string | null
    order: number | null
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
    const pythonCode = `
import sys
import os
import json
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

from scripts.rerank_with_crossencoder import rerank_chunks

try:
    # Prepare candidates for re-ranking
    candidates = ${JSON.stringify(candidates.map(c => ({
      id: c.id,
      text: c.text,
      source: c.source || 'unknown',
      chunk_index: c.order || 0,
      distance: c.distance
    })))}
    
    # Re-rank using CrossEncoder
    reranked = rerank_chunks('''${query.replace(/'/g, "\\'\\'")}''', candidates, top_n=${topN})
    
    result = [
        {
            "id": str(s.get("id", "")),
            "text": s.get("text", ""),
            "source": s.get("source", "unknown"),
            "chunk_index": int(s.get("chunk_index", s.get("order", 0))),
            "rerank_score": float(s.get("rerank_score", 0)),
            "distance": float(s.get("distance", 0))
        }
        for s in reranked
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
          reject(new Error(`No JSON array found in Python output. Output: ${stdout.substring(0, 500)}`))
          return
        }
        
        const result = JSON.parse(jsonMatch[0])
        if (Array.isArray(result)) {
          resolve(result)
        } else {
          reject(new Error(`Expected array, got: ${typeof result}`))
        }
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error instanceof Error ? error.message : String(error)}\nOutput: ${stdout.substring(0, 500)}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`))
    })
  })
}

