// Fix metadata for problematic chunks
import { prisma } from '../src/server/db/client'

interface ChunkMetadata {
  id: string
  topic: string
  key_concepts: string[]
  summary?: string
}

const chunkMetadataFixes: ChunkMetadata[] = [
  {
    id: 'lesson1_chunk_023',
    topic: 'תודעת R, A, C - הסבר והבדלים',
    key_concepts: ['תודעה ראקטיבית', 'תודעה אקטיבית', 'תודעה יצירתית', 'R', 'A', 'C', 'מצב תודעה'],
    summary: 'הסבר על שלושת מצבי התודעה: R (ראקטיבית - העבר), A (אקטיבית - ההווה), C (יצירתית - העתיד). דוגמאות על איך כל מצב תודעה משפיע על ההתנהגות והבחירות.'
  },
  {
    id: 'lesson1_chunk_021',
    topic: 'תודעה ומציאות - הסבר כללי',
    key_concepts: ['תודעה', 'מציאות', 'השתקפות', 'מטפורת המים'],
    summary: 'הסבר כללי על הקשר בין תודעה למציאות, כולל מטפורת המים. דיון על האם תודעה היא אישית או כללית, והשפעת תרבות וחינוך על התודעה.'
  },
  {
    id: 'lesson1_chunk_020',
    topic: 'תודעה ומציאות - מודל הבית ספר',
    key_concepts: ['תודעה', 'מציאות', 'השתקפות', 'מודל הבית ספר', 'מיינד ומטר'],
    summary: 'הסבר על מודל הבית ספר שמסביר את מערכת היחסים בין תודעה למציאות. הנחת העבודה המרכזית: המציאות היא השתקפות של התודעה. דיון על איך תודעה יוצרת מציאות.'
  },
  {
    id: 'lesson1_chunk_027',
    topic: 'פער בין רצון חופשי למציאות - RC ו-AC',
    key_concepts: ['רצון חופשי', 'פער', 'RC', 'AC', 'Reacting Creation', 'Acting Creation', 'בוראים מציאות'],
    summary: 'הסבר על שני צירים מקבילים של בריאת מציאות: AC (בוראים בהלימה עם הרצון החופשי) ו-RC (בוראים בניגוד לרצון החופשי). דוגמאות על פער בין מה שאנחנו רוצים למה שאנחנו חווים.'
  },
  {
    id: 'lesson1_chunk_028',
    topic: 'תודעת C - יצירתית',
    key_concepts: ['תודעה יצירתית', 'C', 'Creating', 'בוראים מציאות', 'פער'],
    summary: 'דיון על תודעת C (יצירתית) - איך מגיעים ל-C, למה אנחנו בוראים מציאות בניגוד לרצון החופשי, ומה יושב בפר (התת מודע).'
  },
  {
    id: 'lesson1_chunk_006',
    topic: 'מעגל התודעה - הוראות שימוש',
    key_concepts: ['מעגל התודעה', 'כלי', 'מסמך', 'תמונת מראה', 'הוראות כתיבה'],
    summary: 'הוראות מפורטות על איך למלא את מעגל התודעה: אורך הכתיבה, מה לכתוב, איך המאמן מגיב, ואיך זה משמש ככלי להכרה מעמיקה יותר.'
  }
]

async function fixChunkMetadata() {
  console.log('🔧 מתקן metadata ל-chunks הבעייתיים...\n')
  console.log('='.repeat(80))
  
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
    } catch (error) {
      console.error(`   ❌ שגיאה בעדכון:`, error)
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('✅ סיום עדכון metadata')
  console.log('='.repeat(80))
  
  await prisma.$disconnect()
}

fixChunkMetadata().catch(console.error)

