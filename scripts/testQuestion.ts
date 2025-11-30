// Test a specific question to see the response
// @ts-ignore - node-fetch types not needed for runtime
const fetch = globalThis.fetch || require('node-fetch')

async function testQuestion() {
  console.log('🧪 בודק את השאלה: "מה זה תודעה ריאקטיבית?"\n')
  
  const url = 'http://localhost:3000/api/chat/stream'
  const testMessage = 'מה זה תודעה ריאקטיבית?'
  
  console.log(`📤 שולח שאלה: "${testMessage}"`)
  console.log(`   URL: ${url}\n`)
  console.log('⏳ ממתין לתשובה...\n')
  console.log('─'.repeat(80))
  console.log()
  
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
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`❌ שגיאה (${response.status}):`)
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
    
    console.log('\n')
    console.log('─'.repeat(80))
    console.log('\n✅ תשובה התקבלה!')
    console.log(`   אורך: ${fullResponse.length} תווים`)
    console.log(`   שורות: ${fullResponse.split('\n').length}`)
    
    // Analyze the response
    console.log('\n📊 ניתוח התשובה:')
    const hasHesitation = /רגע|אה|בוא|זה לא|תן לי/i.test(fullResponse)
    const hasHebrewEnglish = /reacting|creation|reality|man up/i.test(fullResponse)
    const hasHumor = /פרחה|בשוחה|שורפת|רכבת הרים/i.test(fullResponse)
    const hasDirectAnswer = !/אוקיי… בוא נראה רגע/i.test(fullResponse) || fullResponse.indexOf('אוקיי… בוא נראה רגע') === 0
    
    console.log(`   ${hasHesitation ? '✅' : '❌'} יש עצירות/התלבטויות`)
    console.log(`   ${hasHebrewEnglish ? '✅' : '❌'} יש שילוב עברית-אנגלית`)
    console.log(`   ${hasHumor ? '✅' : '❌'} יש הומור/דימויים`)
    console.log(`   ${hasDirectAnswer ? '✅' : '❌'} תשובה ישירה (לא תבניתית)`)
    
  } catch (error) {
    console.error('\n❌ שגיאה:', error)
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`)
    }
  }
}

testQuestion()

