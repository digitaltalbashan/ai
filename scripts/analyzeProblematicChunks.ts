// Analyze problematic chunks that appear in many questions
import { prisma } from '../src/server/db/client'

const problematicChunkIds = [
  'lesson1_chunk_023', // מופיע ב-5 שאלות
  'lesson1_chunk_021', // מופיע ב-4 שאלות
  'lesson1_chunk_020', // מופיע ב-3 שאלות
  'lesson1_chunk_027', // מופיע ב-3 שאלות
  'lesson1_chunk_028', // מופיע ב-3 שאלות
  'lesson1_chunk_006', // מופיע ב-2 שאלות (שאלות על מעגל התודעה)
]

async function analyzeProblematicChunks() {
  console.log('🔍 בודק את התוכן של ה-chunks הבעייתיים...\n')
  console.log('='.repeat(80))
  
  for (const chunkId of problematicChunkIds) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`📄 Chunk: ${chunkId}`)
    console.log('='.repeat(80))
    
    const chunk = await prisma.$queryRawUnsafe<Array<{
      id: string
      text: string
      metadata: any
      source: string | null
      lesson: string | null
      order: number | null
    }>>(
      `SELECT id, text, metadata, source, lesson, "order" 
       FROM knowledge_chunks 
       WHERE id = $1`,
      chunkId
    )
    
    if (chunk.length === 0) {
      console.log(`❌ Chunk לא נמצא!`)
      continue
    }
    
    const c = chunk[0]
    
    console.log(`\n📋 Metadata:`)
    console.log(`   Order: ${c.order ?? 'N/A'}`)
    console.log(`   Lesson: ${c.lesson ?? 'N/A'}`)
    console.log(`   Source: ${c.source ?? 'N/A'}`)
    console.log(`   Title: ${c.metadata?.title || 'N/A'}`)
    console.log(`   Topic: ${c.metadata?.topic || 'N/A'}`)
    console.log(`   Key Concepts: ${c.metadata?.key_concepts?.join(', ') || 'N/A'}`)
    console.log(`   Word Count: ${c.metadata?.word_count || 'N/A'}`)
    console.log(`   Is Standalone: ${c.metadata?.is_standalone || 'N/A'}`)
    
    console.log(`\n📝 תוכן (${c.text.length} תווים):`)
    console.log('-'.repeat(80))
    console.log(c.text)
    console.log('-'.repeat(80))
    
    // בדיקת מילות מפתח
    const keywords = [
      'מעגל התודעה',
      'תודעה ראקטיבית',
      'תודעה אקטיבית',
      'תודעה יצירתית',
      'R', 'A', 'C',
      'reacting', 'acting', 'creating',
      'פער',
      'רצון חופשי',
      'תת מודע'
    ]
    
    console.log(`\n🔑 מילות מפתח שנמצאות:`)
    const foundKeywords: string[] = []
    const textLower = c.text.toLowerCase()
    keywords.forEach(keyword => {
      if (textLower.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword)
      }
    })
    
    if (foundKeywords.length > 0) {
      console.log(`   ${foundKeywords.join(', ')}`)
    } else {
      console.log(`   ⚠️  לא נמצאו מילות מפתח רלוונטיות!`)
    }
    
    // בדיקת איכות הטקסט
    console.log(`\n📊 איכות הטקסט:`)
    const fillerWords = ['אה', 'אוקיי', 'רגע', 'כן', 'נכון', 'אמ', 'א']
    const fillerCount = fillerWords.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      const matches = c.text.match(regex)
      return count + (matches ? matches.length : 0)
    }, 0)
    
    console.log(`   מילות מילוי: ${fillerCount}`)
    console.log(`   אורך: ${c.text.length} תווים`)
    console.log(`   מילים: ${c.text.split(/\s+/).length}`)
    
    if (fillerCount > 10) {
      console.log(`   ⚠️  הרבה מילות מילוי - טקסט לא מעובד`)
    }
    
    if (c.text.length < 500) {
      console.log(`   ⚠️  טקסט קצר מדי - חסר הקשר`)
    } else if (c.text.length > 2000) {
      console.log(`   ⚠️  טקסט ארוך מדי - יכול להכיל נושאים רבים`)
    }
    
    // בדיקת רלוונטיות לשאלות
    console.log(`\n🎯 רלוונטיות לשאלות:`)
    const questions = [
      'מה זה מעגל התודעה?',
      'מה המטרה של מעגל התודעה בקורס?',
      'מה זה מודל R A C',
      'תסביר מה זה תודעת R',
      'מה ההבדל בין תודעת A לתודעת C',
      'למה יש פער'
    ]
    
    questions.forEach(question => {
      const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const relevant = questionWords.some(word => textLower.includes(word))
      if (relevant) {
        console.log(`   ✅ רלוונטי ל: "${question}"`)
      }
    })
  }
  
  await prisma.$disconnect()
}

analyzeProblematicChunks().catch(console.error)

