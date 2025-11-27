import { prisma } from "./db/client"

export interface UserContextData {
  personalInfo?: {
    name?: string
    age?: number
    occupation?: string
    relationshipStatus?: string
    [key: string]: any
  }
  preferences?: {
    [key: string]: any
  }
  conversationHistory?: {
    topics?: string[]
    importantPoints?: string[]
    [key: string]: any
  }
  [key: string]: any
}

/**
 * Get user context from database
 */
export async function getUserContext(userId: string): Promise<UserContextData | null> {
  const userContext = await prisma.userContext.findUnique({
    where: { userId },
  })

  if (!userContext) {
    return null
  }

  try {
    return JSON.parse(userContext.context) as UserContextData
  } catch (error) {
    console.error('Error parsing user context:', error)
    return null
  }
}

/**
 * Update user context in database
 */
export async function updateUserContext(
  userId: string,
  contextUpdate: Partial<UserContextData>
): Promise<UserContextData> {
  const existingContext = await getUserContext(userId)
  
  const mergedContext: UserContextData = {
    ...existingContext,
    ...contextUpdate,
    personalInfo: {
      ...existingContext?.personalInfo,
      ...contextUpdate.personalInfo,
    },
    preferences: {
      ...existingContext?.preferences,
      ...contextUpdate.preferences,
    },
    conversationHistory: {
      ...existingContext?.conversationHistory,
      ...contextUpdate.conversationHistory,
    },
  }

  await prisma.userContext.upsert({
    where: { userId },
    create: {
      userId,
      context: JSON.stringify(mergedContext),
    },
    update: {
      context: JSON.stringify(mergedContext),
    },
  })

  return mergedContext
}

/**
 * Format user context as text for LLM prompt
 */
export function formatUserContextForPrompt(context: UserContextData | null): string {
  if (!context) {
    return ''
  }

  const parts: string[] = []

  if (context.personalInfo) {
    const info = context.personalInfo
    const infoParts: string[] = []
    if (info.name) infoParts.push(`שם: ${info.name}`)
    if (info.age) infoParts.push(`גיל: ${info.age}`)
    if (info.occupation) infoParts.push(`מקצוע: ${info.occupation}`)
    if (info.relationshipStatus) infoParts.push(`מצב משפחתי: ${info.relationshipStatus}`)
    
    if (infoParts.length > 0) {
      parts.push(`מידע אישי על המשתמש:\n${infoParts.join('\n')}`)
    }
  }

  if (context.conversationHistory?.topics && context.conversationHistory.topics.length > 0) {
    parts.push(`נושאים שנדונו בעבר: ${context.conversationHistory.topics.join(', ')}`)
  }

  if (context.conversationHistory?.importantPoints && context.conversationHistory.importantPoints.length > 0) {
    parts.push(`נקודות חשובות מהשיחות הקודמות:\n${context.conversationHistory.importantPoints.map((p: string) => `- ${p}`).join('\n')}`)
  }

  return parts.length > 0 ? `\n\n## קונטקסט אישי של המשתמש:\n${parts.join('\n\n')}\n` : ''
}

/**
 * Extract and update context from conversation
 * This function analyzes the conversation and extracts relevant information
 */
export async function extractContextFromConversation(
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  // Simple extraction - can be enhanced with LLM in the future
  const contextUpdate: Partial<UserContextData> = {
    conversationHistory: {
      topics: [],
      importantPoints: [],
    },
  }

  // Extract potential personal information from user message
  const personalInfoPatterns = [
    { pattern: /אני (?:בן|בת) (\d+)/, field: 'age' },
    { pattern: /אני (?:עובד|עובדת) (?:ב|כמו|כ) (.+?)(?:\.|,|$)/, field: 'occupation' },
    { pattern: /אני (?:נשוי|נשואה|רווק|רווקה|גרוש|גרושה)/, field: 'relationshipStatus' },
  ]

  for (const { pattern, field } of personalInfoPatterns) {
    const match = userMessage.match(pattern)
    if (match) {
      if (!contextUpdate.personalInfo) {
        contextUpdate.personalInfo = {}
      }
      contextUpdate.personalInfo[field] = match[1] || match[0]
    }
  }

  // Get existing context to merge
  const existingContext = await getUserContext(userId)
  
  // Update context
  await updateUserContext(userId, contextUpdate)
}

