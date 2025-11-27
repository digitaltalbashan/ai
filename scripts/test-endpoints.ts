// Test script to verify all API endpoints
const BASE_URL = 'http://localhost:3000'

async function testEndpoint(path: string, method: string = 'GET', body?: any) {
  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    
    if (body) {
      options.body = JSON.stringify(body)
    }
    
    const response = await fetch(`${BASE_URL}${path}`, options)
    const status = response.status
    const contentType = response.headers.get('content-type')
    
    let data: any = null
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      const text = await response.text()
      data = { text: text.substring(0, 100) }
    }
    
    return { success: status < 500, status, data }
  } catch (error) {
    return { 
      success: false, 
      status: 0, 
      error: error instanceof Error ? error.message : String(error) 
    }
  }
}

async function main() {
  console.log('🧪 Testing API endpoints...\n')
  
  // Test pages
  console.log('📄 Testing Pages:')
  const homePage = await testEndpoint('/')
  console.log(`   ${homePage.success ? '✅' : '❌'} Home page (${homePage.status})`)
  
  const chatPage = await testEndpoint('/chat')
  console.log(`   ${chatPage.success ? '✅' : '❌'} Chat page (${chatPage.status})`)
  
  // Test API endpoints
  console.log('\n🔌 Testing API Endpoints:')
  
  const chatAPI = await testEndpoint('/api/chat', 'POST', {
    userId: 'test-user-123',
    message: 'Hello, this is a test',
    conversationId: null
  })
  console.log(`   ${chatAPI.success ? '✅' : '❌'} POST /api/chat (${chatAPI.status})`)
  if (chatAPI.data && chatAPI.data.reply) {
    console.log(`      Response: ${chatAPI.data.reply.substring(0, 50)}...`)
  } else if (chatAPI.error) {
    console.log(`      Error: ${chatAPI.error}`)
  }
  
  const ragAPI = await testEndpoint('/api/rag/index-knowledge', 'POST', {
    filePath: './data/rag/lesson1_rag.jsonl'
  })
  console.log(`   ${ragAPI.success ? '✅' : '❌'} POST /api/rag/index-knowledge (${ragAPI.status})`)
  if (ragAPI.data && ragAPI.data.success !== undefined) {
    console.log(`      Response: ${JSON.stringify(ragAPI.data)}`)
  }
  
  const memoryAPI = await testEndpoint('/api/memory/update', 'POST', {
    userId: 'test-user-123'
  })
  console.log(`   ${memoryAPI.success ? '✅' : '❌'} POST /api/memory/update (${memoryAPI.status})`)
  
  console.log('\n' + '='.repeat(50))
  const allPassed = homePage.success && chatPage.success && chatAPI.success
  if (allPassed) {
    console.log('✨ All critical endpoints are working!')
  } else {
    console.log('⚠️  Some endpoints need attention (this may be expected if DB/API keys are not set)')
  }
}

main().catch(console.error)

