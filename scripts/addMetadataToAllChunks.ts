// Add metadata to all remaining chunks
import { prisma } from '../src/server/db/client'

interface ChunkMetadata {
  id: string
  topic: string
  key_concepts: string[]
  summary?: string
}

const chunkMetadataFixes: ChunkMetadata[] = [
  {
    id: 'lesson1_chunk_005',
    topic: 'מעגל התודעה - סילבוס והוראות',
    key_concepts: ['מעגל התודעה', 'סילבוס', 'הוראות', 'כלי'],
    summary: 'הסבר על סילבוס הקורס ומעגל התודעה ככלי. דיון על גמישות בהוראה והתאמה למשתתפים.'
  },
  {
    id: 'lesson1_chunk_015',
    topic: 'סבל ורצון חופשי',
    key_concepts: ['סבל', 'רצון חופשי', 'מציאות', 'מה אני רוצה'],
    summary: 'הסבר על הקשר בין סבל לרצון חופשי. אנשים שסובלים ולא יודעים מה הם רוצים.'
  },
  {
    id: 'lesson1_chunk_016',
    topic: 'תודעת R, A, C - דוגמה אישית',
    key_concepts: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית', 'R', 'A', 'C', 'דוגמה אישית'],
    summary: 'דוגמה אישית על מעבר מתודעה ראקטיבית (R) לתודעה אקטיבית (A) ויצירתית (C) - עד גיל 30 לא היה מושג מה לעשות.'
  },
  {
    id: 'lesson1_chunk_018',
    topic: 'תודעה ראקטיבית - דוגמה עם ילד',
    key_concepts: ['תודעה ראקטיבית', 'Reacting', 'R', 'דוגמה', 'ילד', 'מתחצף'],
    summary: 'דוגמה על תודעה ראקטיבית: כשהילד מתחצף, אני מתפוצץ עליו. I\'m reacting to reality.'
  },
  {
    id: 'lesson1_chunk_019',
    topic: 'תודעה ראקטיבית - דוגמה עם זוגיות',
    key_concepts: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'R', 'A', 'זוגיות', 'מערכות יחסים', 'דוגמה'],
    summary: 'דוגמה על תודעה ראקטיבית בזוגיות - חוזרים על אותו סיוט, מתגרשים. ההבדל בין R ל-A במערכות יחסים.'
  },
  {
    id: 'lesson1_chunk_022',
    topic: 'תודעה ראקטיבית - משימת התודעה',
    key_concepts: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'משימת התודעה', 'נתיב זרימה', 'כוחות'],
    summary: 'הסבר על משימת התודעה הראקטיבית: למצוא את נתיב הזרימה האופטימלי. לא משנה אם זה תרבות, חברה או דת.'
  },
  {
    id: 'lesson1_chunk_024',
    topic: 'תודעה יצירתית - Creating',
    key_concepts: ['תודעה יצירתית', 'Creating', 'C', 'יוצר', 'בוראים מציאות'],
    summary: 'הסבר על תודעה יצירתית (Creating) - זו תודעה הרבה יותר מעניינת. אנחנו קוראים לזה creating יוצר.'
  },
  {
    id: 'lesson1_chunk_026',
    topic: 'תודעה ומציאות - הקשר',
    key_concepts: ['תודעה', 'מציאות', 'קשר', 'מערכת יחסים', 'R', 'A', 'C'],
    summary: 'הסבר על הקשר בין תודעה למציאות. הפעולה בתודעה היא לא פעולה גלויה לעין. מצב התודעה קובע את מערכת היחסים עם העולם.'
  },
  {
    id: 'lesson1_chunk_031',
    topic: 'תת מודע - דוגמה עם מספר רכב',
    key_concepts: ['תת מודע', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'פער', 'דוגמה', 'מספר רכב'],
    summary: 'דוגמה על תת מודע: זכירה של מספרי רכב בהיפנוזה. התת מודע זוכר מה שהמודע שכח.'
  },
  {
    id: 'lesson1_chunk_033',
    topic: 'תת מודע - דוגמה עם אטרקטיביות',
    key_concepts: ['תת מודע', 'אטרקטיביות', 'דחייה', 'משיכה', 'דוגמה'],
    summary: 'דוגמה על תת מודע: כשניגשתי למישהי אטרקטיבית ונדחיתי, התת מודע הופך אותי להיות הדבר האטרקטיבי הזה.'
  },
  {
    id: 'lesson1_chunk_035',
    topic: 'תת מודע ורצון חופשי - פער',
    key_concepts: ['תת מודע', 'רצון חופשי', 'פער', 'מציאות', 'שכל'],
    summary: 'הסבר על הפער בין תת מודע לרצון חופשי. "אמרתי לך, צדקתי" - איפה השכל?'
  },
  {
    id: 'lesson1_chunk_038',
    topic: 'תת מודע ורצון חופשי',
    key_concepts: ['תת מודע', 'רצון חופשי', 'מציאות', 'זוגיות', 'מה שמניע אותי'],
    summary: 'הסבר על תת מודע ורצון חופשי. מה שמניע אותי זה לא הזוגיות אלא התת מודע שזוכר מה ששכחתי.'
  },
  {
    id: 'lesson1_chunk_043',
    topic: 'תת מודע - פחד ואהבה',
    key_concepts: ['תת מודע', 'תודעה ראקטיבית', 'תודעה אקטיבית', 'רצון חופשי', 'פחד', 'אהבה', 'כלביות'],
    summary: 'הסבר על תת מודע: רודף אחרי עונג, בורח מכאב. פחד ואהבה - שני הכוחות. כלביות במובן של רודף אחרי עונג.'
  },
  {
    id: 'lesson1_chunk_046',
    topic: 'מעגל התודעה - תגובת משתתפת',
    key_concepts: ['מעגל התודעה', 'תגובה', 'משתתפת', 'תודעה ראקטיבית', 'תודעה אקטיבית'],
    summary: 'תגובה של משתתפת על מעגל התודעה. דיון על סבל, לקיחת מושכות, והקשר לתודעה ראקטיבית ואקטיבית.'
  }
]

async function addMetadataToAllChunks() {
  console.log('🔧 מוסיף metadata ל-chunks הנוספים...\n')
  console.log('='.repeat(80))
  
  let updated = 0
  let errors = 0
  
  for (const fix of chunkMetadataFixes) {
    console.log(`\n📝 מעדכן: ${fix.id}`)
    console.log(`   Topic: ${fix.topic}`)
    console.log(`   Key Concepts: ${fix.key_concepts.join(', ')}`)
    
    try {
      // Get current chunk
      const currentChunk = await prisma.$queryRawUnsafe<Array<{
        id: string
        metadata: any
      }>>(
        `SELECT id, metadata FROM knowledge_chunks WHERE id = $1`,
        fix.id
      )
      
      if (currentChunk.length === 0) {
        console.log(`   ⚠️  Chunk לא נמצא!`)
        errors++
        continue
      }
      
      const currentMetadata = currentChunk[0].metadata || {}
      
      // Update metadata
      const updatedMetadata = {
        ...currentMetadata,
        topic: fix.topic,
        key_concepts: fix.key_concepts,
        summary: fix.summary,
        // Keep existing fields
        title: currentMetadata.title || fix.id,
        order: currentMetadata.order,
        lesson: currentMetadata.lesson,
        source: currentMetadata.source,
        language: currentMetadata.language || 'he',
        tags: currentMetadata.tags || [],
        word_count: currentMetadata.word_count,
        is_standalone: currentMetadata.is_standalone
      }
      
      // Update in database
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_chunks 
         SET metadata = $1::jsonb 
         WHERE id = $2`,
        JSON.stringify(updatedMetadata),
        fix.id
      )
      
      console.log(`   ✅ עודכן בהצלחה!`)
      updated++
    } catch (error) {
      console.error(`   ❌ שגיאה בעדכון:`, error)
      errors++
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('✅ סיום עדכון metadata')
  console.log('='.repeat(80))
  console.log(`\n📊 סיכום:`)
  console.log(`   עודכנו: ${updated}`)
  console.log(`   שגיאות: ${errors}`)
  console.log(`   סה"כ: ${chunkMetadataFixes.length}`)
  
  await prisma.$disconnect()
}

addMetadataToAllChunks().catch(console.error)

