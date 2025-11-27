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
 * Update user memory by summarizing recent conversation
 * Creates a new memory entry with embedding for future semantic search
 */
export async function updateUserMemory(
  userId: string,
  recentMessages: Message[],
  memoryType: string = 'SESSION_SUMMARY'
): Promise<void> {
  // Build a prompt to summarize key facts, emotional themes, and important details
  const conversationText = recentMessages
    .map((msg) => {
      const role = msg.sender === MessageSender.USER ? 'User' : 'Assistant'
      return `${role}: ${msg.content}`
    })
    .join('\n\n')

  const summaryPrompt = `You are analyzing a therapeutic coaching conversation. Create a concise summary that captures:

1. Key facts about the user (background, current situation, goals)
2. Emotional themes and patterns that emerged
3. Important personal details or insights shared
4. Progress or shifts that occurred in the conversation

Keep the summary factual and focused on what would be useful for future conversations. Aim for 2-4 sentences.

Conversation:
${conversationText}

Summary:`

  // Call LLM to generate summary
  const response = await chatCompletion([
    {
      role: 'system',
      content: 'You are a helpful assistant that creates concise, factual summaries of therapeutic conversations.',
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

  // Store in database using raw SQL (since Prisma doesn't fully support pgvector)
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_memories (id, "userId", summary, embedding, "memoryType", "createdAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, NOW())`,
    userId,
    summary,
    embeddingStr,
    memoryType
  )
}

