// Test script to verify API endpoints
import { readFile } from 'fs/promises'
import { join } from 'path'

async function testFileStructure() {
  console.log('🔍 Testing file structure...')
  const checks = [
    { path: 'data/rag/lesson1_rag.jsonl', name: 'RAG data file' },
    { path: 'scripts/indexLesson1Rag.ts', name: 'Indexing script' },
    { path: 'src/server/openai.ts', name: 'OpenAI wrapper' },
    { path: 'src/server/db/client.ts', name: 'Database client' },
    { path: 'app/api/chat/route.ts', name: 'Chat API route' },
    { path: 'app/chat/page.tsx', name: 'Chat UI page' },
  ]
  
  let allOk = true
  for (const check of checks) {
    try {
      await readFile(join(process.cwd(), check.path))
      console.log(`   ✅ ${check.name}`)
    } catch (error) {
      console.log(`   ❌ ${check.name} - File not found`)
      allOk = false
    }
  }
  return allOk
}

async function testRAGFile() {
  console.log('\n🔍 Testing RAG data file...')
  try {
    const filePath = join(process.cwd(), 'data', 'rag', 'lesson1_rag.jsonl')
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(l => l.trim())
    
    console.log(`   ✅ Found ${lines.length} chunks in RAG file`)
    
    // Validate first chunk
    try {
      const firstChunk = JSON.parse(lines[0])
      if (firstChunk.id && firstChunk.text) {
        console.log(`   ✅ First chunk valid (ID: ${firstChunk.id})`)
        return true
      } else {
        console.log(`   ❌ First chunk missing required fields`)
        return false
      }
    } catch (error) {
      console.log(`   ❌ Failed to parse first chunk: ${error}`)
      return false
    }
  } catch (error) {
    console.log(`   ❌ RAG file not found or unreadable: ${error}`)
    return false
  }
}

async function testImports() {
  console.log('\n🔍 Testing module imports...')
  try {
    // Test that modules can be imported (without executing)
    const { prisma } = await import('../src/server/db/client')
    console.log('   ✅ Database client imports successfully')
    
    const { embedText } = await import('../src/server/openai')
    console.log('   ✅ OpenAI wrapper imports successfully')
    
    const { searchKnowledge } = await import('../src/server/vector/search')
    console.log('   ✅ Vector search imports successfully')
    
    const { buildPrompt } = await import('../src/server/prompt/buildPrompt')
    console.log('   ✅ Prompt builder imports successfully')
    
    return true
  } catch (error) {
    console.log(`   ❌ Import error: ${error instanceof Error ? error.message : error}`)
    return false
  }
}

async function main() {
  console.log('🧪 Starting API and structure tests...\n')
  
  const structureOk = await testFileStructure()
  const ragOk = await testRAGFile()
  const importsOk = await testImports()
  
  console.log('\n' + '='.repeat(50))
  if (structureOk && ragOk && importsOk) {
    console.log('✨ All structure tests passed!')
    console.log('\n📝 Next steps:')
    console.log('   1. Create .env file with DATABASE_URL')
    console.log('   2. Set up PostgreSQL database with pgvector')
    console.log('   3. Run: pnpm db:migrate')
    console.log('   4. Run: pnpm rag:index:lesson1')
    console.log('   5. Start dev server: pnpm dev')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed. Please fix the issues above.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

