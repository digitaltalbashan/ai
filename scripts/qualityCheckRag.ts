// Comprehensive quality check for optimized RAG file
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../src/server/db/client'
import { searchKnowledge } from '../src/server/vector/search'

interface ChunkData {
  id: string
  text: string
  summary?: string
  metadata: {
    lesson: number
    source: string
    order: number
    title: string
    language: string
    tags: string[]
    topic?: string
    key_concepts?: string[]
    word_count?: number
    is_standalone?: boolean
  }
}

interface QualityReport {
  structure: {
    totalChunks: number
    validJson: number
    hasRequiredFields: number
    hasSummary: number
    hasTopic: number
    hasKeyConcepts: number
  }
  length: {
    average: number
    min: number
    max: number
    optimalRange: number
    tooShort: number
    tooLong: number
  }
  content: {
    emptyChunks: number
    duplicateIds: number
    sequentialOrder: boolean
    uniqueTopics: number
  }
  semantic: {
    testQueries: Array<{
      query: string
      found: boolean
      relevantChunks: number
      topChunkId?: string
      topChunkRelevance?: number
    }>
  }
}

async function checkStructure(chunks: ChunkData[]): Promise<QualityReport['structure']> {
  let validJson = 0
  let hasRequiredFields = 0
  let hasSummary = 0
  let hasTopic = 0
  let hasKeyConcepts = 0

  for (const chunk of chunks) {
    validJson++
    
    if (chunk.id && chunk.text && chunk.metadata) {
      hasRequiredFields++
    }
    
    if (chunk.summary) {
      hasSummary++
    }
    
    if (chunk.metadata.topic) {
      hasTopic++
    }
    
    if (chunk.metadata.key_concepts && chunk.metadata.key_concepts.length > 0) {
      hasKeyConcepts++
    }
  }

  return {
    totalChunks: chunks.length,
    validJson,
    hasRequiredFields,
    hasSummary,
    hasTopic,
    hasKeyConcepts
  }
}

async function checkLength(chunks: ChunkData[]): Promise<QualityReport['length']> {
  const lengths = chunks.map(c => c.text.length)
  const average = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const min = Math.min(...lengths)
  const max = Math.max(...lengths)
  const optimalRange = chunks.filter(c => c.text.length >= 1000 && c.text.length <= 2000).length
  const tooShort = chunks.filter(c => c.text.length < 1000).length
  const tooLong = chunks.filter(c => c.text.length > 2000).length

  return {
    average: Math.round(average),
    min,
    max,
    optimalRange,
    tooShort,
    tooLong
  }
}

async function checkContent(chunks: ChunkData[]): Promise<QualityReport['content']> {
  const emptyChunks = chunks.filter(c => !c.text || c.text.trim().length === 0).length
  const ids = chunks.map(c => c.id)
  const duplicateIds = ids.length - new Set(ids).size
  const orders = chunks.map(c => c.metadata.order)
  const sequentialOrder = orders.every((order, index) => order === index + 1)
  const uniqueTopics = new Set(chunks.map(c => c.metadata.topic).filter(Boolean)).size

  return {
    emptyChunks,
    duplicateIds,
    sequentialOrder,
    uniqueTopics
  }
}

async function checkSemanticSearch(chunks: ChunkData[]): Promise<QualityReport['semantic']> {
  const testQueries = [
    {
      query: 'מה זה מעגל התודעה',
      expectedChunks: ['lesson1_chunk_005', 'lesson1_chunk_046', 'lesson1_chunk_047']
    },
    {
      query: 'תודעה ראקטיבית',
      expectedChunks: ['lesson1_chunk_016', 'lesson1_chunk_017', 'lesson1_chunk_018']
    },
    {
      query: 'תת מודע',
      expectedChunks: ['lesson1_chunk_022', 'lesson1_chunk_023', 'lesson1_chunk_024']
    },
    {
      query: 'רצון חופשי',
      expectedChunks: ['lesson1_chunk_005', 'lesson1_chunk_010', 'lesson1_chunk_011']
    }
  ]

  const results = []

  for (const test of testQueries) {
    try {
      const retrieved = await searchKnowledge(test.query, 5)
      
      // Check if expected chunks are in results
      const foundChunkIds = retrieved.map(c => c.id)
      const relevantChunks = test.expectedChunks.filter(id => foundChunkIds.includes(id)).length
      const found = relevantChunks > 0
      const topChunkId = retrieved[0]?.id
      
      // Check if top chunk contains query terms
      const topChunk = retrieved[0]
      const topChunkRelevance = topChunk ? 
        (topChunk.text.toLowerCase().includes(test.query.toLowerCase().split(' ')[0]) ? 100 : 50) : 0

      results.push({
        query: test.query,
        found,
        relevantChunks,
        topChunkId,
        topChunkRelevance
      })
    } catch (error) {
      console.error(`Error testing query "${test.query}":`, error)
      results.push({
        query: test.query,
        found: false,
        relevantChunks: 0
      })
    }
  }

  return { testQueries: results }
}

async function main() {
  console.log('🔍 Starting RAG Quality Check...')
  console.log('='.repeat(80))

  try {
    // Read file
    const filePath = join(process.cwd(), 'data', 'rag', 'lesson1_rag.jsonl')
    console.log(`📖 Reading file: ${filePath}`)
    const fileContent = await readFile(filePath, 'utf-8')
    const lines = fileContent.trim().split('\n').filter(line => line.trim())
    
    const chunks: ChunkData[] = []
    for (const line of lines) {
      try {
        chunks.push(JSON.parse(line))
      } catch (error) {
        console.error(`❌ Invalid JSON in line: ${line.substring(0, 50)}...`)
      }
    }

    console.log(`✅ Loaded ${chunks.length} chunks\n`)

    // Run checks
    console.log('📊 Running quality checks...\n')

    const structure = await checkStructure(chunks)
    const length = await checkLength(chunks)
    const content = await checkContent(chunks)
    
    // Semantic search check (requires DB connection)
    console.log('🔍 Testing semantic search (requires database connection)...')
    let semantic
    try {
      semantic = await checkSemanticSearch(chunks)
    } catch (error) {
      console.error('⚠️  Semantic search test failed (database may not be connected):', error)
      semantic = { testQueries: [] }
    }

    // Generate report
    console.log('\n' + '='.repeat(80))
    console.log('📋 QUALITY REPORT')
    console.log('='.repeat(80))

    // Structure
    console.log('\n📐 STRUCTURE:')
    console.log(`  Total chunks: ${structure.totalChunks}`)
    console.log(`  Valid JSON: ${structure.validJson}/${structure.totalChunks} (${Math.round(structure.validJson/structure.totalChunks*100)}%)`)
    console.log(`  Has required fields: ${structure.hasRequiredFields}/${structure.totalChunks} (${Math.round(structure.hasRequiredFields/structure.totalChunks*100)}%)`)
    console.log(`  Has summary: ${structure.hasSummary}/${structure.totalChunks} (${Math.round(structure.hasSummary/structure.totalChunks*100)}%)`)
    console.log(`  Has topic: ${structure.hasTopic}/${structure.totalChunks} (${Math.round(structure.hasTopic/structure.totalChunks*100)}%)`)
    console.log(`  Has key concepts: ${structure.hasKeyConcepts}/${structure.totalChunks} (${Math.round(structure.hasKeyConcepts/structure.totalChunks*100)}%)`)

    // Length
    console.log('\n📏 LENGTH:')
    console.log(`  Average: ${length.average} characters`)
    console.log(`  Range: ${length.min} - ${length.max} characters`)
    console.log(`  Optimal range (1000-2000): ${length.optimalRange}/${structure.totalChunks} (${Math.round(length.optimalRange/structure.totalChunks*100)}%)`)
    console.log(`  Too short (<1000): ${length.tooShort}`)
    console.log(`  Too long (>2000): ${length.tooLong}`)

    // Content
    console.log('\n📝 CONTENT:')
    console.log(`  Empty chunks: ${content.emptyChunks}`)
    console.log(`  Duplicate IDs: ${content.duplicateIds}`)
    console.log(`  Sequential order: ${content.sequentialOrder ? '✅' : '❌'}`)
    console.log(`  Unique topics: ${content.uniqueTopics}`)

    // Semantic
    if (semantic.testQueries.length > 0) {
      console.log('\n🔍 SEMANTIC SEARCH:')
      for (const test of semantic.testQueries) {
        const status = test.found ? '✅' : '❌'
        console.log(`  ${status} "${test.query}"`)
        console.log(`     Found relevant chunks: ${test.relevantChunks}`)
        if (test.topChunkId) {
          console.log(`     Top chunk: ${test.topChunkId} (relevance: ${test.topChunkRelevance}%)`)
        }
      }
    }

    // Overall score
    console.log('\n' + '='.repeat(80))
    console.log('📊 OVERALL SCORE:')
    
    let score = 0
    let maxScore = 0

    // Structure (30 points)
    maxScore += 30
    score += (structure.hasRequiredFields / structure.totalChunks) * 10
    score += (structure.hasSummary / structure.totalChunks) * 10
    score += (structure.hasTopic / structure.totalChunks) * 10

    // Length (30 points)
    maxScore += 30
    score += (length.optimalRange / structure.totalChunks) * 30

    // Content (20 points)
    maxScore += 20
    score += content.sequentialOrder ? 10 : 0
    score += content.duplicateIds === 0 ? 10 : 0

    // Semantic (20 points)
    maxScore += 20
    if (semantic.testQueries.length > 0) {
      const semanticScore = semantic.testQueries.reduce((sum, test) => sum + (test.found ? 1 : 0), 0)
      score += (semanticScore / semantic.testQueries.length) * 20
    }

    const percentage = Math.round((score / maxScore) * 100)
    const grade = percentage >= 90 ? 'A' : percentage >= 80 ? 'B' : percentage >= 70 ? 'C' : percentage >= 60 ? 'D' : 'F'

    console.log(`  Score: ${Math.round(score)}/${maxScore} (${percentage}%)`)
    console.log(`  Grade: ${grade}`)
    
    if (percentage >= 90) {
      console.log('  Status: ✅ Excellent quality!')
    } else if (percentage >= 80) {
      console.log('  Status: ✅ Good quality')
    } else if (percentage >= 70) {
      console.log('  Status: ⚠️  Acceptable, but could be improved')
    } else {
      console.log('  Status: ❌ Needs improvement')
    }

    console.log('\n' + '='.repeat(80))

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:')
    const recommendations: string[] = []
    
    if (structure.hasSummary < structure.totalChunks) {
      recommendations.push(`Add summaries to ${structure.totalChunks - structure.hasSummary} chunks`)
    }
    
    if (length.tooShort > 0) {
      recommendations.push(`Merge or expand ${length.tooShort} chunks that are too short`)
    }
    
    if (length.tooLong > 0) {
      recommendations.push(`Split ${length.tooLong} chunks that are too long`)
    }
    
    if (!content.sequentialOrder) {
      recommendations.push('Fix chunk ordering to be sequential')
    }
    
    if (semantic.testQueries.length > 0) {
      const failedQueries = semantic.testQueries.filter(t => !t.found)
      if (failedQueries.length > 0) {
        recommendations.push(`Improve semantic search for: ${failedQueries.map(q => q.query).join(', ')}`)
      }
    }

    if (recommendations.length === 0) {
      console.log('  ✅ No recommendations - file is in excellent condition!')
    } else {
      recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`)
      })
    }

    console.log('\n' + '='.repeat(80))

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error during quality check:', error)
    process.exit(1)
  }
}

main().catch(console.error)

