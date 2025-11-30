// Long-term memory update utilities
import { prisma } from '@/src/server/db/client'
import { embedText, chatCompletion } from '@/src/server/openai'
import { MessageSender } from '@prisma/client'

interface Message {
  sender: MessageSender
  content: string
  createdAt: Date
}

/**
 * Update user memory by summarizing the active conversation (INCREMENTAL)
 * This is the "working memory" that gets updated with every message
 * Uses incremental summarization: previous summary + new messages only
 * Creates or updates a single memory entry per user for the active conversation
 */
export async function updateUserMemory(
  userId: string,
  recentMessages: Message[],
  memoryType: string = 'ACTIVE_CONVERSATION'
): Promise<void> {
  if (recentMessages.length === 0) {
    // No messages yet, nothing to remember
    return
  }

  // Load previous summary (if exists)
  const previousMemory = await prisma.$queryRawUnsafe<Array<{
    summary: string
  }>>(
    `SELECT summary FROM user_memories 
     WHERE "userId" = $1 AND "memoryType" = $2 
     LIMIT 1`,
    userId,
    memoryType
  )

  const previousSummary = previousMemory.length > 0 ? previousMemory[0].summary : null

  // Format only the new messages (last 6 messages for incremental update)
  const newMessages = recentMessages.slice(-6)
  const newMessagesText = newMessages
    .map((msg) => {
      const role = msg.sender === MessageSender.USER ? 'User' : 'Assistant'
      return `${role}: ${msg.content}`
    })
    .join('\n\n')

  // Build incremental summary prompt
  const summaryPrompt = `סוכם את החלק האחרון של השיחה ל-2-5 משפטים (30-80 מילים).

שמור רק מידע חיוני:
- הכוונה של המשתמש
- עובדות חדשות שהוא שיתף
- החלטות או מטרות שחשובות לתור הבא
- מידע חשוב לשמירה על רצף

אל תכתוב מחדש את כל השיחה.
אל תחרוג מ-5 משפטים.

${previousSummary ? `סיכום קודם:\n${previousSummary}\n\n` : ''}הודעות חדשות:
${newMessagesText}

סיכום חדש:`

  // Call LLM to generate summary in Hebrew
  const response = await chatCompletion([
    {
      role: 'system',
      content: 'אתה עוזר שיוצר סיכומים תמציתיים ועובדתיים בעברית של שיחות פעילות כדי לשמור על רצף. כל הסיכום חייב להיות בעברית בלבד.',
    },
    {
      role: 'user',
      content: summaryPrompt,
    },
  ])

  const summary = response.choices[0]?.message?.content?.trim() || ''

  if (!summary) {
    console.warn('Failed to generate memory summary')
    return
  }

  // Generate embedding for the summary
  const embedding = await embedText(summary)

  // Convert to PostgreSQL vector format
  const embeddingStr = `[${embedding.join(',')}]`

  // Upsert: Update existing ACTIVE_CONVERSATION memory or create new one
  // This ensures there's only one active memory per user
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_memories (id, "userId", summary, embedding, "memoryType", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, NOW(), NOW())
    ON CONFLICT ("userId", "memoryType") 
    DO UPDATE SET 
      summary = EXCLUDED.summary,
      embedding = EXCLUDED.embedding,
      "updatedAt" = NOW()`,
    userId,
    summary,
    embeddingStr,
    memoryType
  )
}

