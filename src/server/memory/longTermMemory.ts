/**
 * Long-term Memory Management
 * Handles persistent user memory that lives outside of conversations
 */
import { prisma } from '@/src/server/db/client'
import { chatCompletion } from '../openai'
import { LongTermMemory, createEmptyMemory, MemoryUpdateResult } from '@/src/types/longTermMemory'

/**
 * Load user's long-term memory from database
 */
export async function loadLongTermMemory(userId: string): Promise<LongTermMemory> {
  const userContext = await prisma.userContext.findUnique({
    where: { userId },
  })

  if (!userContext) {
    // Create empty memory if doesn't exist
    const emptyMemory = createEmptyMemory(userId)
    await saveLongTermMemory(userId, emptyMemory)
    return emptyMemory
  }

  try {
    const parsed = JSON.parse(userContext.context) as LongTermMemory
    // Ensure user_id matches
    parsed.user_id = userId
    return parsed
  } catch (error) {
    console.error('Error parsing long-term memory:', error)
    // Return empty memory if parsing fails
    return createEmptyMemory(userId)
  }
}

/**
 * Save user's long-term memory to database
 */
export async function saveLongTermMemory(
  userId: string,
  memory: LongTermMemory
): Promise<void> {
  // Ensure user_id matches
  memory.user_id = userId
  memory.last_updated = new Date().toISOString()

  await prisma.userContext.upsert({
    where: { userId },
    create: {
      userId,
      context: JSON.stringify(memory),
    },
    update: {
      context: JSON.stringify(memory),
    },
  })
}

/**
 * Build a condensed memory snippet for prompts
 * This prevents context window overflow
 */
export function buildMemorySnippet(
  memory: LongTermMemory,
  maxLength: number = 500
): string {
  const parts: string[] = []

  // Add profile info if exists
  if (memory.profile && Object.keys(memory.profile).length > 0) {
    const profileInfo = Object.entries(memory.profile)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')
    if (profileInfo) {
      parts.push(`פרופיל: ${profileInfo}`)
    }
  }

  // Add preferences (support both object and array formats)
  if (memory.preferences) {
    if (Array.isArray(memory.preferences)) {
      // Legacy array format
      if (memory.preferences.length > 0) {
        parts.push(`העדפות: ${memory.preferences.join(', ')}`)
      }
    } else {
      // New object format
      const prefEntries = Object.entries(memory.preferences)
        .filter(([_, value]) => value)
        .map(([key, value]) => `${key}: ${value}`)
      if (prefEntries.length > 0) {
        parts.push(`העדפות: ${prefEntries.join(', ')}`)
      }
    }
  }

  // Add high-importance facts
  const importantFacts = memory.long_term_facts
    ?.filter((f) => f.importance === 'high')
    .slice(0, 5) // Limit to top 5
    .map((f) => f.text)

  if (importantFacts && importantFacts.length > 0) {
    parts.push(`עובדות חשובות: ${importantFacts.join('; ')}`)
  }

  // Add memory summary if exists (most condensed)
  if (memory.memory_summary) {
    parts.push(`סיכום זיכרון: ${memory.memory_summary}`)
  }

  let snippet = parts.join('\n')

  // Truncate if too long
  if (snippet.length > maxLength) {
    snippet = snippet.substring(0, maxLength - 3) + '...'
  }

  return snippet || 'אין זיכרון מתמשך למשתמש זה.'
}

/**
 * Extract memory updates using LLM as Memory Extractor
 * Returns structured updates (new_facts, new_preferences, task_updates)
 * Based on AI_BEHAVIOR_SPEC.md specification
 */
export async function extractMemoryUpdates(
  userId: string,
  userMessage: string,
  assistantReply: string,
  currentMemory: LongTermMemory
): Promise<MemoryUpdateResult> {
  // Serialize short version of current memory for prompt
  const memorySnippet = JSON.stringify({
    profile: currentMemory.profile,
    preferences: currentMemory.preferences,
    long_term_facts: currentMemory.long_term_facts?.slice(0, 5) || [], // Only first 5 for context
    open_tasks: currentMemory.open_tasks || [],
    conversation_themes: currentMemory.conversation_themes?.slice(0, 3) || []
  }, null, 2)

  const extractionPrompt = `אתה מנהל זיכרון מתמשך למשתמש.

קלט:
1. הזיכרון הנוכחי (חלקי)
2. ההודעה האחרונה של המשתמש
3. התשובה האחרונה של העוזר

משימה:
זהה אם יש עובדות חדשות, העדפות חדשות, או עדכוני משימות להוסיף/לעדכן.

החזר רק JSON בפורמט הבא (ללא הסברים, ללא markdown):
{
  "new_facts": [
    {
      "text": "string (בעברית)",
      "importance": "low" | "medium" | "high",
      "tags": ["string"]
    }
  ],
  "new_preferences": [
    {
      "key": "string (למשל: 'language', 'answer_length', 'tone')",
      "value": "string"
    }
  ],
  "task_updates": [
    {
      "id": "string | null (null למשימה חדשה)",
      "description": "string",
      "status": "open" | "in_progress" | "done"
    }
  ]
}

זיכרון נוכחי (חלקי):
\`\`\`json
${memorySnippet}
\`\`\`

הודעת משתמש:
${userMessage}

תשובת עוזר:
${assistantReply}

החזר רק JSON (ללא הסברים):`

  try {
    const response = await chatCompletion([
      {
        role: 'system',
        content: 'אתה עוזר שמחלץ עדכוני זיכרון. החזר רק JSON תקין בפורמט המבוקש, ללא הסברים נוספים. כל הטקסטים בעברית.'
      },
      {
        role: 'user',
        content: extractionPrompt
      }
    ])

    const responseText = response.choices[0]?.message?.content?.trim() || ''

    // Extract JSON from response
    let jsonText = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0]
    }

    // Parse JSON
    const updates = JSON.parse(jsonText) as MemoryUpdateResult
    return updates
  } catch (error) {
    console.error('Error extracting memory updates:', error)
    // Return empty updates if extraction fails
    return {}
  }
}

/**
 * Apply memory updates to current memory
 * Merges new facts, preferences, and tasks into the existing memory
 */
export function applyMemoryUpdatesToUserContext(
  currentMemory: LongTermMemory,
  updates: MemoryUpdateResult
): LongTermMemory {
  const updatedMemory: LongTermMemory = {
    ...currentMemory,
    last_updated: new Date().toISOString()
  }

  // Apply new facts
  if (updates.new_facts && updates.new_facts.length > 0) {
    const newFacts = updates.new_facts.map(fact => ({
      id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: fact.text,
      importance: fact.importance,
      tags: fact.tags || [],
      last_updated: new Date().toISOString()
    }))

    updatedMemory.long_term_facts = [
      ...(updatedMemory.long_term_facts || []),
      ...newFacts
    ]
  }

  // Apply new preferences
  if (updates.new_preferences && updates.new_preferences.length > 0) {
    // Convert old array format to object if needed
    if (Array.isArray(updatedMemory.preferences)) {
      updatedMemory.preferences = {}
    } else if (!updatedMemory.preferences) {
      updatedMemory.preferences = {}
    }

    // Apply each preference update
    updates.new_preferences.forEach(pref => {
      if (updatedMemory.preferences && typeof updatedMemory.preferences === 'object') {
        (updatedMemory.preferences as any)[pref.key] = pref.value
      }
    })
  }

  // Apply task updates
  if (updates.task_updates && updates.task_updates.length > 0) {
    if (!updatedMemory.open_tasks) {
      updatedMemory.open_tasks = []
    }

    updates.task_updates.forEach(taskUpdate => {
      if (taskUpdate.id === null) {
        // New task
        updatedMemory.open_tasks!.push({
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: taskUpdate.description,
          status: taskUpdate.status,
          created_at: new Date().toISOString()
        })
      } else {
        // Update existing task
        const taskIndex = updatedMemory.open_tasks!.findIndex(t => t.id === taskUpdate.id)
        if (taskIndex >= 0) {
          updatedMemory.open_tasks![taskIndex] = {
            ...updatedMemory.open_tasks![taskIndex],
            description: taskUpdate.description,
            status: taskUpdate.status,
            last_updated: new Date().toISOString()
          }
        }
      }
    })
  }

  return updatedMemory
}

/**
 * Update long-term memory using LLM as Memory Extractor
 * This is called after every user message + assistant reply
 * Uses the new structured extraction approach
 */
export async function updateLongTermMemoryWithLLM(
  userId: string,
  userMessage: string,
  assistantReply: string,
  currentMemory: LongTermMemory
): Promise<LongTermMemory> {
  // Step 1: Extract structured updates
  const updates = await extractMemoryUpdates(userId, userMessage, assistantReply, currentMemory)

  // Step 2: Apply updates to current memory
  const updatedMemory = applyMemoryUpdatesToUserContext(currentMemory, updates)

  // Step 3: Ensure required fields
  if (!updatedMemory.user_id) {
    updatedMemory.user_id = userId
  }

  // Step 4: Clean up old/unused items (optional, can be called periodically)
  // await cleanupLongTermMemory(updatedMemory)

  return updatedMemory
}

/**
 * Generate a condensed memory summary using LLM
 * This is useful when memory becomes too large
 */
export async function summarizeLongTermMemory(
  memory: LongTermMemory
): Promise<string> {
  const memoryText = JSON.stringify(memory, null, 2)

  const summaryPrompt = `צור סיכום תמציתי בעברית של הזיכרון הבא. הסיכום צריך לכלול את העובדות החשובות ביותר, ההעדפות, והנושאים המרכזיים.

זיכרון:
\`\`\`json
${memoryText}
\`\`\`

סיכום תמציתי (2-4 משפטים בעברית):`

  try {
    const response = await chatCompletion([
      {
        role: 'system',
        content: 'אתה עוזר שיוצר סיכומים תמציתיים בעברית של זיכרונות משתמשים.',
      },
      {
        role: 'user',
        content: summaryPrompt,
      },
    ])

    return response.choices[0]?.message?.content?.trim() || ''
  } catch (error) {
    console.error('Error summarizing long-term memory:', error)
    return ''
  }
}

/**
 * Clean up old/unused memory items
 */
export async function cleanupLongTermMemory(
  memory: LongTermMemory,
  maxFacts: number = 20
): Promise<LongTermMemory> {
  // Sort facts by importance and last_used
  if (memory.long_term_facts && memory.long_term_facts.length > maxFacts) {
    const sortedFacts = memory.long_term_facts.sort((a, b) => {
      // First by importance
      const importanceOrder = { high: 3, medium: 2, low: 1 }
      const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance]
      if (importanceDiff !== 0) return importanceDiff

      // Then by last_used (most recent first)
      const aLastUsed = a.last_used || a.last_updated
      const bLastUsed = b.last_used || b.last_updated
      return new Date(bLastUsed).getTime() - new Date(aLastUsed).getTime()
    })

    memory.long_term_facts = sortedFacts.slice(0, maxFacts)
  }

  // Limit conversation themes
  if (memory.conversation_themes && memory.conversation_themes.length > 10) {
    memory.conversation_themes = memory.conversation_themes.slice(-10)
  }

  return memory
}

