// Script to generate 1000 questions and analyze chunk overlap and quality
// Now uses improved search with re-ranking
import { readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'

interface QuestionAnalysis {
  question: string
  chunks: Array<{
    id: string
    text: string
    metadata: any
    source?: string
    order?: number
    distance?: number
    metadataScore?: number
  }>
  numChunks: number
  chunkIds: string[]
  quality: {
    relevance: number // 0-1 based on text/keyword matching
    metadataMatch: number // 0-1 based on metadata matching
    overall: number // average
  }
}

interface ChunkOverlap {
  chunkId: string
  questionIndices: number[]
  count: number
  sources: string[]
}

interface QuestionOverlap {
  question1: number
  question2: number
  question1Text: string
  question2Text: string
  overlappingChunks: string[]
  overlapCount: number
}

/**
 * Generate questions based on content from RAG files
 */
async function generateQuestions(numQuestions: number = 1000): Promise<string[]> {
  console.log(`\n🔍 Generating ${numQuestions} questions from RAG content...`)
  
  const ragDir = join(process.cwd(), 'data', 'rag')
  const files = await readdir(ragDir)
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))
  
  // Sample chunks from different files to get diverse content
  const allChunks: Array<{ text: string; metadata: any; source: string }> = []
  
  for (const file of jsonlFiles.slice(0, 20)) { // Sample from first 20 files
    try {
      const content = await readFile(join(ragDir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(l => l.trim())
      
      // Sample 5-10 chunks per file
      const sampleSize = Math.min(10, Math.floor(lines.length / 2))
      for (let i = 0; i < sampleSize; i++) {
        const idx = Math.floor((i / sampleSize) * lines.length)
        try {
          const chunk = JSON.parse(lines[idx])
          if (chunk.text && chunk.text.length > 100) {
            allChunks.push({
              text: chunk.text,
              metadata: chunk.metadata || {},
              source: file
            })
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }
  
  console.log(`   📚 Sampled ${allChunks.length} chunks from ${jsonlFiles.length} files`)
  
  // Generate questions based on patterns
  const questions: string[] = []
  const questionTemplates = [
    // Concept questions
    'מה זה {concept}?',
    'מה זה {concept} לפי הקורס?',
    'תסביר מה זה {concept}.',
    'מה המשמעות של {concept}?',
    'איך הקורס מגדיר {concept}?',
    
    // How/Why questions
    'איך {action}?',
    'למה {situation}?',
    'מה ההסבר ל{situation}?',
    'איך נוצר {concept}?',
    'למה {concept} קורה?',
    
    // Difference questions
    'מה ההבדל בין {concept1} ל{concept2}?',
    'איך {concept1} שונה מ{concept2}?',
    
    // Purpose/Goal questions
    'מה המטרה של {concept}?',
    'למה משתמשים ב{concept}?',
    'מה התפקיד של {concept}?',
    
    // Process questions
    'איך עובד {concept}?',
    'מה התהליך של {concept}?',
    'איך מתבצע {concept}?',
  ]
  
  // Extract concepts and keywords from chunks
  const concepts = new Set<string>()
  const keywords = new Set<string>()
  
  // Common course concepts
  const courseConcepts = [
    'מעגל התודעה', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית',
    'תת מודע', 'רצון חופשי', 'פחד', 'מציאות', 'שחיקה', 'תקיעות',
    'תודעה', 'מנהיגות תודעתית', 'תיקון', 'הרגל', 'התנגדות',
    'קונפליקט', 'צמיחה', 'פיתוח אישי', 'מנהיגות', 'תודעה',
    'R', 'A', 'C', 'תודעת R', 'תודעת A', 'תודעת C'
  ]
  
  courseConcepts.forEach(c => concepts.add(c))
  
  // Extract more concepts from chunk metadata
  for (const chunk of allChunks) {
    if (chunk.metadata?.key_concepts) {
      chunk.metadata.key_concepts.forEach((c: string) => concepts.add(c))
    }
    if (chunk.metadata?.topic) {
      keywords.add(chunk.metadata.topic)
    }
    
    // Extract keywords from text (simple heuristic)
    const text = chunk.text.toLowerCase()
    const hebrewWords = text.match(/[\u0590-\u05FF]+/g) || []
    hebrewWords.forEach(word => {
      if (word.length > 3 && word.length < 15) {
        keywords.add(word)
      }
    })
  }
  
  console.log(`   💡 Found ${concepts.size} concepts and ${keywords.size} keywords`)
  
  // Generate questions
  const conceptArray = Array.from(concepts)
  const keywordArray = Array.from(keywords).slice(0, 500) // Limit keywords to avoid too many
  
  // Generate questions systematically to ensure we get 1000
  const seenQuestions = new Set<string>()
  
  // Strategy 1: Generate from all templates with all concepts
  for (const template of questionTemplates) {
    for (const concept of conceptArray) {
      let question = template.replace(/{concept}/g, concept)
      
      if (template.includes('{concept1}') && template.includes('{concept2}')) {
        for (const c2 of conceptArray) {
          if (c2 !== concept) {
            question = template.replace('{concept1}', concept).replace('{concept2}', c2)
            if (!seenQuestions.has(question) && question.length > 10) {
              questions.push(question)
              seenQuestions.add(question)
              if (questions.length >= numQuestions) break
            }
          }
        }
      } else {
        if (!seenQuestions.has(question) && question.length > 10 && !question.includes('{')) {
          questions.push(question)
          seenQuestions.add(question)
          if (questions.length >= numQuestions) break
        }
      }
      if (questions.length >= numQuestions) break
    }
    if (questions.length >= numQuestions) break
  }
  
  // Strategy 2: Add action/situation questions
  const actions = ['נוצרת תודעה ראקטיבית', 'עובד מעגל התודעה', 'מתפתחת שחיקה',
                   'נוצר קונפליקט', 'מתבצע תיקון', 'מתפתחת צמיחה', 'נוצרת תקיעות',
                   'מתפתחת תודעה אקטיבית', 'מתפתחת תודעה יצירתית']
  const situations = ['יש פער בין מה שאנחנו רוצים למה שאנחנו חווים',
                     'אנחנו מרגישים תקועים', 'יש שחיקה', 'יש קונפליקט',
                     'אנחנו לא מצליחים להשתנות', 'יש פחד', 'יש התנגדות']
  
  for (const action of actions) {
    for (const template of questionTemplates.filter(t => t.includes('{action}'))) {
      const question = template.replace('{action}', action)
      if (!seenQuestions.has(question) && question.length > 10) {
        questions.push(question)
        seenQuestions.add(question)
        if (questions.length >= numQuestions) break
      }
    }
    if (questions.length >= numQuestions) break
  }
  
  for (const situation of situations) {
    for (const template of questionTemplates.filter(t => t.includes('{situation}'))) {
      const question = template.replace('{situation}', situation)
      if (!seenQuestions.has(question) && question.length > 10) {
        questions.push(question)
        seenQuestions.add(question)
        if (questions.length >= numQuestions) break
      }
    }
    if (questions.length >= numQuestions) break
  }
  
  // Strategy 3: Add questions from chunk content
  for (const chunk of allChunks) {
    if (questions.length >= numQuestions) break
    
    const sentences = chunk.text.split(/[.!?]\s+/).filter(s => s.length > 30 && s.length < 200)
    for (const sentence of sentences.slice(0, 2)) {
      // Extract potential concepts from sentence
      const words = sentence.split(/\s+/).filter(w => w.length > 3 && w.length < 15)
      for (const word of words.slice(0, 3)) {
        const question = `מה זה ${word}?`
        if (!seenQuestions.has(question) && question.length > 10) {
          questions.push(question)
          seenQuestions.add(question)
          if (questions.length >= numQuestions) break
        }
      }
      if (questions.length >= numQuestions) break
    }
  }
  
  // Strategy 4: Add keyword-based questions
  for (const keyword of keywordArray) {
    if (questions.length >= numQuestions) break
    
    const variations = [
      `מה זה ${keyword}?`,
      `מה המשמעות של ${keyword}?`,
      `תסביר מה זה ${keyword}.`,
      `מה זה ${keyword} לפי הקורס?`
    ]
    
    for (const question of variations) {
      if (!seenQuestions.has(question) && question.length > 10) {
        questions.push(question)
        seenQuestions.add(question)
        if (questions.length >= numQuestions) break
      }
    }
  }
  
  // Strategy 5: Fill remaining with concept variations
  while (questions.length < numQuestions && conceptArray.length > 0) {
    const concept = conceptArray[questions.length % conceptArray.length]
    const variations = [
      `מה זה ${concept}?`,
      `מה זה ${concept} לפי הקורס?`,
      `תסביר מה זה ${concept}.`,
      `מה המשמעות של ${concept}?`,
      `איך הקורס מגדיר ${concept}?`,
      `מה המטרה של ${concept}?`,
      `למה משתמשים ב${concept}?`,
      `איך עובד ${concept}?`
    ]
    
    for (const question of variations) {
      if (!seenQuestions.has(question) && questions.length < numQuestions) {
        questions.push(question)
        seenQuestions.add(question)
      }
    }
  }
  
  // Ensure we have exactly numQuestions
  const finalQuestions = questions.slice(0, numQuestions)
  
  console.log(`   ✅ Generated ${finalQuestions.length} unique questions`)
  
  return finalQuestions
}

/**
 * Analyze chunks for a question
 */
async function analyzeQuestion(question: string, questionIndex: number): Promise<QuestionAnalysis> {
  // Search for chunks using improved re-ranking
  // Import dynamically to use the improved search
  const { searchKnowledgeWithRerank } = await import('../src/server/vector/searchWithRerank')
  const chunks = await searchKnowledgeWithRerank(question, 40, 8)
  
  // Calculate quality scores
  const questionLower = question.toLowerCase()
  const questionWords = questionLower.split(/\s+/).filter(w => w.length > 2)
  
  let relevanceSum = 0
  let metadataMatchSum = 0
  
  for (const chunk of chunks) {
    const text = chunk.text.toLowerCase()
    const metadata = chunk.metadata || {}
    const topic = (metadata.topic || '').toLowerCase()
    const concepts = (metadata.key_concepts || []).map((c: string) => c.toLowerCase())
    
    // Relevance: how many question words appear in chunk text
    const matchingWords = questionWords.filter(w => text.includes(w)).length
    const relevance = Math.min(1, matchingWords / Math.max(1, questionWords.length))
    relevanceSum += relevance
    
    // Metadata match: check if topic or concepts match
    let metadataMatch = 0
    for (const word of questionWords) {
      if (topic.includes(word)) metadataMatch += 0.5
      if (concepts.some(c => c.includes(word))) metadataMatch += 0.3
    }
    metadataMatch = Math.min(1, metadataMatch)
    metadataMatchSum += metadataMatch
  }
  
  const avgRelevance = chunks.length > 0 ? relevanceSum / chunks.length : 0
  const avgMetadataMatch = chunks.length > 0 ? metadataMatchSum / chunks.length : 0
  const overall = (avgRelevance + avgMetadataMatch) / 2
  
  return {
    question,
    chunks: chunks.map(c => ({
      id: c.id,
      text: c.text,
      metadata: c.metadata,
      source: c.source,
      order: c.metadata?.order,
      relevanceScore: c.relevanceScore
    })),
    numChunks: chunks.length,
    chunkIds: chunks.map(c => c.id),
    quality: {
      relevance: avgRelevance,
      metadataMatch: avgMetadataMatch,
      overall
    }
  }
}

/**
 * Find chunk overlaps between questions
 */
function findChunkOverlaps(analyses: QuestionAnalysis[]): ChunkOverlap[] {
  const chunkMap = new Map<string, number[]>()
  
  analyses.forEach((analysis, qIdx) => {
    analysis.chunkIds.forEach(chunkId => {
      if (!chunkMap.has(chunkId)) {
        chunkMap.set(chunkId, [])
      }
      chunkMap.get(chunkId)!.push(qIdx)
    })
  })
  
  const overlaps: ChunkOverlap[] = []
  
  chunkMap.forEach((questionIndices, chunkId) => {
    if (questionIndices.length > 1) {
      // Get source from first analysis that has this chunk
      const firstAnalysis = analyses[questionIndices[0]]
      const chunk = firstAnalysis.chunks.find(c => c.id === chunkId)
      const source = chunk?.source || 'unknown'
      
      overlaps.push({
        chunkId,
        questionIndices,
        count: questionIndices.length,
        sources: [source]
      })
    }
  })
  
  return overlaps.sort((a, b) => b.count - a.count)
}

/**
 * Find question overlaps
 */
function findQuestionOverlaps(analyses: QuestionAnalysis[]): QuestionOverlap[] {
  const overlaps: QuestionOverlap[] = []
  
  for (let i = 0; i < analyses.length; i++) {
    for (let j = i + 1; j < analyses.length; j++) {
      const q1 = analyses[i]
      const q2 = analyses[j]
      
      const q1ChunkIds = new Set(q1.chunkIds)
      const q2ChunkIds = new Set(q2.chunkIds)
      
      const overlappingChunks = q1.chunkIds.filter(id => q2ChunkIds.has(id))
      
      if (overlappingChunks.length > 0) {
        overlaps.push({
          question1: i,
          question2: j,
          question1Text: q1.question,
          question2Text: q2.question,
          overlappingChunks,
          overlapCount: overlappingChunks.length
        })
      }
    }
  }
  
  return overlaps.sort((a, b) => b.overlapCount - a.overlapCount)
}

async function main() {
  console.log('🚀 Generating 1000 questions and analyzing RAG quality...')
  console.log('='.repeat(80))
  
  const startTime = Date.now()
  
  // Step 1: Generate questions
  const questions = await generateQuestions(1000)
  
  // Step 2: Analyze each question
  console.log(`\n📊 Analyzing chunks for ${questions.length} questions...`)
  const analyses: QuestionAnalysis[] = []
  
  for (let i = 0; i < questions.length; i++) {
    if ((i + 1) % 50 === 0) {
      console.log(`   Progress: ${i + 1}/${questions.length} (${((i + 1) / questions.length * 100).toFixed(1)}%)`)
    }
    
    try {
      const analysis = await analyzeQuestion(questions[i], i)
      analyses.push(analysis)
    } catch (error) {
      console.error(`   ❌ Error analyzing question ${i + 1}:`, error)
      // Continue with next question
    }
  }
  
  console.log(`\n✅ Analyzed ${analyses.length} questions`)
  
  // Step 3: Find overlaps
  console.log(`\n🔍 Finding chunk overlaps...`)
  const chunkOverlaps = findChunkOverlaps(analyses)
  const questionOverlaps = findQuestionOverlaps(analyses)
  
  // Step 4: Calculate statistics
  const avgChunksPerQuestion = analyses.reduce((sum, a) => sum + a.numChunks, 0) / analyses.length
  const avgQuality = analyses.reduce((sum, a) => sum + a.quality.overall, 0) / analyses.length
  const avgRelevance = analyses.reduce((sum, a) => sum + a.quality.relevance, 0) / analyses.length
  const avgMetadataMatch = analyses.reduce((sum, a) => sum + a.quality.metadataMatch, 0) / analyses.length
  
  const uniqueChunks = new Set(analyses.flatMap(a => a.chunkIds))
  const chunksUsedMultipleTimes = chunkOverlaps.length
  
  // Step 5: Generate report
  const report = {
    summary: {
      totalQuestions: analyses.length,
      totalUniqueChunks: uniqueChunks.size,
      avgChunksPerQuestion: avgChunksPerQuestion.toFixed(2),
      chunksUsedMultipleTimes,
      avgQuality: avgQuality.toFixed(3),
      avgRelevance: avgRelevance.toFixed(3),
      avgMetadataMatch: avgMetadataMatch.toFixed(3),
    },
    topOverlappingChunks: chunkOverlaps.slice(0, 20).map(o => ({
      chunkId: o.chunkId,
      usedInQuestions: o.count,
      questionIndices: o.questionIndices.slice(0, 10) // First 10
    })),
    topQuestionOverlaps: questionOverlaps.slice(0, 20).map(o => ({
      question1: o.question1Text.substring(0, 60),
      question2: o.question2Text.substring(0, 60),
      overlappingChunks: o.overlapCount
    })),
    qualityDistribution: {
      excellent: analyses.filter(a => a.quality.overall >= 0.8).length,
      good: analyses.filter(a => a.quality.overall >= 0.6 && a.quality.overall < 0.8).length,
      fair: analyses.filter(a => a.quality.overall >= 0.4 && a.quality.overall < 0.6).length,
      poor: analyses.filter(a => a.quality.overall < 0.4).length,
    },
    questions: analyses.map(a => ({
      question: a.question,
      numChunks: a.numChunks,
      quality: a.quality,
      chunkIds: a.chunkIds
    }))
  }
  
  // Save report
  const reportPath = join(process.cwd(), 'data', 'rag_quality_report.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  
  // Print summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 RAG Quality Analysis Report')
  console.log('='.repeat(80))
  console.log(`\n📈 Summary:`)
  console.log(`   Total questions analyzed: ${analyses.length}`)
  console.log(`   Total unique chunks used: ${uniqueChunks.size}`)
  console.log(`   Average chunks per question: ${avgChunksPerQuestion.toFixed(2)}`)
  console.log(`   Chunks used in multiple questions: ${chunksUsedMultipleTimes}`)
  console.log(`\n🎯 Quality Scores:`)
  console.log(`   Overall: ${avgQuality.toFixed(3)}`)
  console.log(`   Relevance: ${avgRelevance.toFixed(3)}`)
  console.log(`   Metadata Match: ${avgMetadataMatch.toFixed(3)}`)
  console.log(`\n📊 Quality Distribution:`)
  console.log(`   Excellent (≥0.8): ${report.qualityDistribution.excellent}`)
  console.log(`   Good (0.6-0.8): ${report.qualityDistribution.good}`)
  console.log(`   Fair (0.4-0.6): ${report.qualityDistribution.fair}`)
  console.log(`   Poor (<0.4): ${report.qualityDistribution.poor}`)
  console.log(`\n🔄 Top 10 Most Overlapping Chunks:`)
  chunkOverlaps.slice(0, 10).forEach((o, i) => {
    console.log(`   ${i + 1}. ${o.chunkId}: used in ${o.count} questions`)
  })
  console.log(`\n⏱️  Duration: ${duration}s`)
  console.log(`\n💾 Full report saved to: ${reportPath}`)
  console.log('='.repeat(80) + '\n')
  
  await prisma.$disconnect()
}

main().catch(console.error)

