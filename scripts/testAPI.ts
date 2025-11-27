// Test the API endpoint directly
// @ts-ignore - node-fetch types not needed for runtime
const fetch = globalThis.fetch || require('node-fetch')

async function testAPI() {
  console.log('🧪 בודק את ה-API endpoint...\n')
  
  const url = 'http://localhost:3000/api/chat/stream'
  const testMessage = 'מה זה ריאקטיביות?'
  
  console.log(`📤 שולח שאלה: "${testMessage}"`)
  console.log(`   URL: ${url}\n`)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testMessage,
      }),
    })
    
    console.log(`📥 תגובה מהשרת:`)
    console.log(`   Status: ${response.status}`)
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()))
    console.log()
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`❌ שגיאה:`)
      console.log(errorText)
      return
    }
    
    // Read streaming response
    const reader = response.body
    if (!reader) {
      console.log('❌ אין body בתגובה')
      return
    }
    
    let fullResponse = ''
    const decoder = new TextDecoder()
    
    for await (const chunk of reader) {
      const text = decoder.decode(chunk)
      fullResponse += text
      process.stdout.write(text)
    }
    
    console.log('\n\n✅ תשובה התקבלה!')
    console.log(`   אורך: ${fullResponse.length} תווים`)
    
  } catch (error) {
    console.error('\n❌ שגיאה:', error)
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`)
    }
  }
}

testAPI()

