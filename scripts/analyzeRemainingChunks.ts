// Analyze remaining chunks that need metadata
import { prisma } from '../src/server/db/client'

const chunkIds = [
  'lesson1_chunk_005',
  'lesson1_chunk_015',
  'lesson1_chunk_016',
  'lesson1_chunk_018',
  'lesson1_chunk_019',
  'lesson1_chunk_022',
  'lesson1_chunk_024',
  'lesson1_chunk_026',
  'lesson1_chunk_031',
  'lesson1_chunk_033',
  'lesson1_chunk_035',
  'lesson1_chunk_038',
  'lesson1_chunk_043',
  'lesson1_chunk_046'
]

async function analyzeRemainingChunks() {
  console.log('🔍 בודק את התוכן של ה-chunks הנוספים...\n')
  console.log('='.repeat(80))
  
  for (const chunkId of chunkIds) {
    const chunk = await prisma.$queryRawUnsafe<Array<{
      id: string
      text: string
      metadata: any
      order: number | null
    }>>(
      `SELECT id, text, metadata, "order" 
       FROM knowledge_chunks 
       WHERE id = $1`,
      chunkId
    )
    
    if (chunk.length === 0) {
      console.log(`\n❌ ${chunkId} - לא נמצא!`)
      continue
    }
    
    const c = chunk[0]
    const textPreview = c.text.substring(0, 300)
    
    console.log(`\n${'='.repeat(80)}`)
    console.log(`📄 ${chunkId} (Order: ${c.order ?? 'N/A'})`)
    console.log('='.repeat(80))
    console.log(`\n📝 תוכן (${c.text.length} תווים):`)
    console.log(textPreview + (c.text.length > 300 ? '...' : ''))
    
    // Check for key terms
    const keywords = {
      'מעגל התודעה': c.text.includes('מעגל התודעה') || c.text.includes('מעגל תודעה'),
      'תודעה ראקטיבית': c.text.includes('תודעה ראקטיבית') || c.text.includes('ראקטיבית') || c.text.includes('reacting'),
      'תודעה אקטיבית': c.text.includes('תודעה אקטיבית') || c.text.includes('אקטיבית') || c.text.includes('acting'),
      'תודעה יצירתית': c.text.includes('תודעה יצירתית') || c.text.includes('יצירתית') || c.text.includes('creating'),
      'R': c.text.includes(' R ') || c.text.includes('(R') || c.text.includes('R,') || c.text.includes('R '),
      'A': c.text.includes(' A ') || c.text.includes('(A') || c.text.includes('A,') || c.text.includes('A '),
      'C': c.text.includes(' C ') || c.text.includes('(C') || c.text.includes('C,') || c.text.includes('C '),
      'פער': c.text.includes('פער'),
      'רצון חופשי': c.text.includes('רצון חופשי'),
      'תת מודע': c.text.includes('תת מודע') || c.text.includes('תת-מודע'),
      'RC': c.text.includes('RC') || c.text.includes('Reacting Creation'),
      'AC': c.text.includes('AC') || c.text.includes('Acting Creation'),
      'מציאות': c.text.includes('מציאות'),
      'תודעה': c.text.includes('תודעה')
    }
    
    const foundKeywords = Object.entries(keywords)
      .filter(([_, found]) => found)
      .map(([keyword, _]) => keyword)
    
    console.log(`\n🔑 מילות מפתח: ${foundKeywords.length > 0 ? foundKeywords.join(', ') : 'לא נמצאו'}`)
  }
  
  await prisma.$disconnect()
}

analyzeRemainingChunks().catch(console.error)

