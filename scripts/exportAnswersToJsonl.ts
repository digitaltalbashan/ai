// Export answers and full chunk details for 50 questions to JSONL format
import { queryWithOpenAIRag } from '../src/server/vector/queryWithOpenAIRag'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const questions = [
  // תודעה וראקטיביות
  'מה מפעיל אותי ברגעים שבהם אני מגיב אוטומטית?',
  'איך אני מרגיש בגוף בזמן הפעלה ראקטיבית?',
  'מהו הטריגר שחוזר על עצמו בחיי?',
  'האם אני מזהה את ההבדל בין האירוע עצמו לבין מה שמופעל בתוכי?',
  'מהי האמונה הפנימית שמפעילה את התגובה הראקטיבית?',
  'מה אני מרוויח מהתגובה הישנה שלי?',
  'מה אני מפחד שיקרה אם אגיב אחרת?',
  'האם אני מסוגל לעצור רגע לפני שאני מגיב?',
  'מה קורה אם אני נושם במקום להגיב?',
  'איך נראה הרגע הקטן שבו בחירה יכולה להיוולד?',
  
  // מודעות ואחריות
  'מה אני רואה בי שאני מתקשה להודות בו?',
  'האם אני מבלבל בין אשמה לאחריות?',
  'מהי אחריות עבורי — עול או חופש?',
  'איפה בחיי אני עדיין מחכה שמשהו חיצוני ישתנה?',
  'איפה אני מרגיש שאני ב"אחריות יתר" ולא באמת בזרימה?',
  'מהו הדבר שאני יודע על עצמי אך עדיין לא מיישם?',
  'מהן הבחירות הקטנות שמרכיבות את היום שלי?',
  'איזו בחירה אחת קטנה יכולה לשנות את האיכות של חיי?',
  'האם אני פועל לפי מודעות או לפי הרגל?',
  'מה מופיע בי כשאני מפסיק להאשים אחרים?',
  
  // יצירה ואישיות חדשה
  'מי אני רוצה להיות בסיטואציות מאתגרות?',
  'איזו איכות פנימית אני מבקש להביא היום?',
  'אילו בחירות קטנות יוצרות את האדם שאני רוצה להיות?',
  'האם אני יוצר את חיי או מגיב אליהם?',
  'מה מונע ממני ליצור שינוי עמוק יותר?',
  'מהו הרגל אחד שאם אשנה — ישנה את כל חיי?',
  'מהו הפחד שמחזיק אותי מחוץ ליצירה?',
  'אילו דפוסים אני מזהה שחוזרים שוב ושוב?',
  'איך ייראה יום אחד שבו אני בוחר לאורך כל הדרך?',
  'מה אני מתעקש לשמר למרות שכבר אינו משרת אותי?',
  
  // נוכחות, הקשבה ויחסים
  'מתי בפעם האחרונה הייתי נוכח באמת?',
  'מה מונע ממני להיות נוכח עם אדם אחר?',
  'האם אני מקשיב כדי להבין או כדי להגיב?',
  'מה קורה לי כשאני מרגיש פגיע בתוך קשר?',
  'איפה אני מחפש שליטה במקום קשר?',
  'מה אני מפחד שיראו בי אם אהיה פגיע?',
  'האם אני רואה את האדם שמולי — או את הפחדים שלי?',
  'מה אני מבקש לקבל בתוך יחסים שאינני מבטא?',
  'איך הייתי רוצה שמישהו יקשיב לי — והאם אני עושה זאת לאחרים?',
  'אילו יחסים בחיי מזמינים אותי לגדילה?',
  
  // ערכים, ייעוד, כוונה
  'מה באמת חשוב לי בחיים האלה?',
  'מהם הערכים שמגדירים אותי?',
  'האם אני חי לפי הערכים או לפי הפחדים?',
  'מהו הייעוד הפנימי שלי — לא כמקצוע אלא כביטוי?',
  'מאיזה מקום אני פועל בדרך כלל — פחד או כוונה?',
  'מהי הכוונה העמוקה שמבקשת לכוון אותי כעת?',
  'איך נראית פעולה שנעשית מתוך השראה?',
  'איזה חזון נמצא בתוכי שאני מפחד לומר בקול?',
  'מהי פעולה קטנה אחת שתקרב אותי לחזון שלי?',
  'איך ייראו חיי אם אחיה אותם מתוך ערכים, ייעוד, כוונה ונוכחות?'
]

interface ChunkDetail {
  id: string
  text: string
  source: string
  chunk_index: number
  rerank_score: number
  distance: number
}

interface ExportEntry {
  question: string
  answer: string
  chunks: ChunkDetail[]
  timing?: {
    retrieve_time: number
    rerank_time: number
    llm_time: number
    total_time: number
  }
}

async function exportAnswers() {
  console.log('🚀 Starting export of answers and chunks for 50 questions...')
  console.log('='.repeat(100))
  console.log('')

  const entries: ExportEntry[] = []

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    console.log(`\n[${i + 1}/${questions.length}] Processing: "${question}"`)
    console.log('-'.repeat(100))

    try {
      // Query with RAG (topK=50, topN=8)
      const result = await queryWithOpenAIRag(
        question, // searchQuery
        question, // question
        50,        // topK
        8,         // topN
        undefined  // userContext (optional)
      )

      // Format chunks with full details
      const chunks: ChunkDetail[] = result.sources.map(chunk => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        chunk_index: chunk.chunk_index,
        rerank_score: chunk.rerank_score,
        distance: chunk.distance
      }))

      const entry: ExportEntry = {
        question,
        answer: result.answer,
        chunks,
        timing: result.timing
      }

      entries.push(entry)

      console.log(`✅ Answer generated (${result.answer.length} chars)`)
      console.log(`📚 Chunks: ${chunks.length}`)
      if (result.timing) {
        console.log(`⏱️  Total time: ${result.timing.total_time.toFixed(2)}s`)
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`❌ Error processing question ${i + 1}:`, error)
      // Add entry with error
      entries.push({
        question,
        answer: `Error: ${error instanceof Error ? error.message : String(error)}`,
        chunks: [],
        timing: undefined
      })
    }
  }

  // Write to JSONL file
  const outputPath = join(process.cwd(), 'data', 'exported_answers.jsonl')
  const jsonlContent = entries.map(entry => JSON.stringify(entry, null, 0)).join('\n')
  
  await writeFile(outputPath, jsonlContent, 'utf-8')

  console.log('\n' + '='.repeat(100))
  console.log('✅ Export complete!')
  console.log(`📄 File saved to: ${outputPath}`)
  console.log(`📊 Total entries: ${entries.length}`)
  console.log(`✅ Successful: ${entries.filter(e => !e.answer.startsWith('Error:')).length}`)
  console.log(`❌ Errors: ${entries.filter(e => e.answer.startsWith('Error:')).length}`)
  console.log('='.repeat(100))
}

// Run export
exportAnswers().catch(console.error)

