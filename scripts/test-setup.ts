// Test script to verify project setup
import { prisma } from '../src/server/db/client'
import { embedText } from '../src/server/openai'

async function testDatabase() {
  console.log('🔍 Testing database connection...')
  try {
    await prisma.$connect()
    console.log('✅ Database connection successful')
    
    // Test if we can query
    const userCount = await prisma.user.count()
    console.log(`✅ Database query successful (Users: ${userCount})`)
    
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error instanceof Error ? error.message : error)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

async function testEmbeddings() {
  console.log('🔍 Testing local embeddings...')
  try {
    const testText = 'Hello, this is a test'
    const embedding = await embedText(testText)
    
    if (embedding && embedding.length === 768) {
      console.log('✅ Local embeddings working (vector dimension: 768)')
      return true
    } else {
      console.error('❌ Unexpected embedding dimension:', embedding.length)
      return false
    }
  } catch (error) {
    console.error('❌ Embeddings test failed:', error instanceof Error ? error.message : error)
    return false
  }
}

async function testEnvironment() {
  console.log('🔍 Checking environment variables...')
  const issues: string[] = []
  
  if (!process.env.DATABASE_URL) {
    issues.push('DATABASE_URL is not set')
  } else {
    console.log('✅ DATABASE_URL is set')
  }
  
  if (issues.length > 0) {
    console.error('❌ Environment issues found:')
    issues.forEach(issue => console.error(`   - ${issue}`))
    return false
  }
  
  return true
}

async function main() {
  console.log('🧪 Starting project setup tests...\n')
  
  const envOk = await testEnvironment()
  if (!envOk) {
    console.log('\n⚠️  Please set up your .env file with DATABASE_URL')
    console.log('   Copy .env.example to .env and fill in your values')
    process.exit(1)
  }
  
  console.log('')
  const dbOk = await testDatabase()
  console.log('')
  const embeddingsOk = await testEmbeddings()
  
  console.log('\n' + '='.repeat(50))
  if (dbOk && embeddingsOk) {
    console.log('✨ All tests passed! Project is ready to use.')
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
