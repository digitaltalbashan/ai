// Frontend integration test
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

async function testFrontend() {
  console.log('🧪 Frontend Integration Test\n')
  console.log('='.repeat(100))
  
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  
  console.log(`\n1️⃣ Checking if server is running on ${baseUrl}...`)
  
  try {
    const response = await fetch(baseUrl, { 
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    })
    
    if (response.ok) {
      console.log(`   ✅ Server is running! (Status: ${response.status})`)
    } else {
      console.log(`   ⚠️  Server responded with status: ${response.status}`)
    }
  } catch (error: any) {
    console.log(`   ❌ Server is not running or not accessible`)
    console.log(`   Error: ${error.message}`)
    console.log(`\n   💡 Please start the server with: pnpm dev`)
    process.exit(1)
  }
  
  console.log(`\n2️⃣ Testing API endpoints...`)
  
  // Test auth endpoint
  try {
    const authResponse = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    if (authResponse.ok) {
      const session = await authResponse.json()
      console.log(`   ✅ Auth endpoint works`)
      console.log(`   Session status: ${session.user ? 'authenticated' : 'unauthenticated'}`)
    } else {
      console.log(`   ⚠️  Auth endpoint returned: ${authResponse.status}`)
    }
  } catch (error: any) {
    console.log(`   ❌ Auth endpoint error: ${error.message}`)
  }
  
  // Test chat endpoint (should require auth)
  try {
    const chatResponse = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/plain'
      },
      body: JSON.stringify({
        message: 'test',
        conversationId: null
      })
    })
    
    if (chatResponse.status === 401) {
      console.log(`   ✅ Chat endpoint requires authentication (expected)`)
    } else if (chatResponse.ok) {
      console.log(`   ✅ Chat endpoint works`)
    } else {
      console.log(`   ⚠️  Chat endpoint returned: ${chatResponse.status}`)
    }
  } catch (error: any) {
    console.log(`   ⚠️  Chat endpoint error: ${error.message}`)
  }
  
  console.log(`\n3️⃣ Testing environment variables...`)
  
  const useOpenAI = process.env.USE_OPENAI === 'true'
  const hasApiKey = !!process.env.OPENAI_API_KEY
  const hasDbUrl = !!process.env.DATABASE_URL
  
  console.log(`   USE_OPENAI: ${useOpenAI ? '✅' : '❌'}`)
  console.log(`   OPENAI_API_KEY: ${hasApiKey ? '✅' : '❌'}`)
  console.log(`   DATABASE_URL: ${hasDbUrl ? '✅' : '❌'}`)
  
  if (!useOpenAI || !hasApiKey || !hasDbUrl) {
    console.log(`\n   ⚠️  Some environment variables are missing!`)
  }
  
  console.log(`\n4️⃣ Frontend pages check...`)
  
  const pages = [
    '/',
    '/chat',
    '/auth/signin'
  ]
  
  for (const page of pages) {
    try {
      const response = await fetch(`${baseUrl}${page}`, {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        redirect: 'manual'
      })
      
      if (response.status === 200 || response.status === 307 || response.status === 308) {
        console.log(`   ✅ ${page} - accessible`)
      } else {
        console.log(`   ⚠️  ${page} - status: ${response.status}`)
      }
    } catch (error: any) {
      console.log(`   ❌ ${page} - error: ${error.message}`)
    }
  }
  
  console.log(`\n` + '='.repeat(100))
  console.log(`✅ Frontend test complete!`)
  console.log(`\n📝 Next steps:`)
  console.log(`   1. Open ${baseUrl} in your browser`)
  console.log(`   2. Sign in with Google`)
  console.log(`   3. Test the chat interface`)
  console.log(`   4. Send a message and verify response`)
  console.log('='.repeat(100))
}

testFrontend().catch(console.error)

