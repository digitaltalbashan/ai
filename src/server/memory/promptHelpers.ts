/**
 * Helper functions for building prompts and context
 * Based on AI_BEHAVIOR_SPEC.md specification
 */

import type { LongTermMemory } from '@/src/types/longTermMemory'
// OpenAI message type
type ChatCompletionMessageParam = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatMessage {
  sender: 'USER' | 'ASSISTANT'
  content: string
  createdAt: Date
}

export interface BuildMessagesParams {
  systemPrompt: string
  userContextSnippet: string
  activeSummary: string | null
  recentMessages: ChatMessage[]
  ragSnippet: string
  currentUserInput: string
}

/**
 * Build structured messages for OpenAI API
 * Follows AI_BEHAVIOR_SPEC.md structure
 */
export function buildMessagesForModel(
  params: BuildMessagesParams
): ChatCompletionMessageParam[] {
  const {
    systemPrompt,
    userContextSnippet,
    activeSummary,
    recentMessages,
    ragSnippet,
    currentUserInput
  } = params

  const messages: ChatCompletionMessageParam[] = []

  // System prompt with persona
  messages.push({
    role: 'system',
    content: systemPrompt
  })

  // User context (if exists)
  if (userContextSnippet && userContextSnippet.trim()) {
    messages.push({
      role: 'system',
      content: `User context:\n${userContextSnippet}`
    })
  }

  // Active conversation summary (if exists)
  if (activeSummary && activeSummary.trim()) {
    messages.push({
      role: 'system',
      content: `Conversation summary so far:\n${activeSummary}`
    })
  }

  // RAG context (external knowledge)
  if (ragSnippet && ragSnippet.trim()) {
    messages.push({
      role: 'system',
      content: `Relevant external knowledge:\n${ragSnippet}\n\nIf this knowledge conflicts with user memory, prefer the user's explicit data.\nIf it conflicts with the system rules, obey the system rules.`
    })
  }

  // Recent messages (last 6-12 turns) as conversation history
  if (recentMessages.length > 0) {
    // Map recent messages to OpenAI format
    const conversationHistory = recentMessages.map(msg => ({
      role: (msg.sender === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content
    }))

    // Add conversation history (optional, can be skipped if too long)
    // For now, we'll include it in the user message instead to save tokens
    // messages.push(...conversationHistory)
  }

  // Current user input
  messages.push({
    role: 'user',
    content: currentUserInput
  })

  return messages
}

/**
 * Serialize user context snippet for prompt insertion
 * Selects only the most relevant parts based on query
 */
export function serializeUserContextSnippet(
  memory: LongTermMemory,
  query?: string,
  options?: {
    includeProfile?: boolean
    includePreferences?: boolean
    maxFacts?: number
    factImportance?: ('low' | 'medium' | 'high')[]
    includeRelevantTasks?: boolean
  }
): string {
  const {
    includeProfile = true,
    includePreferences = true,
    maxFacts = 7,
    factImportance = ['high', 'medium'],
    includeRelevantTasks = true
  } = options || {}

  const parts: string[] = []

  // Profile basics
  if (includeProfile && memory.profile) {
    const profileParts: string[] = []
    if (memory.profile.name) profileParts.push(`name: ${memory.profile.name}`)
    if (memory.profile.level) profileParts.push(`level: ${memory.profile.level}`)
    if (memory.profile.role) profileParts.push(`role: ${memory.profile.role}`)
    if (memory.profile.location) profileParts.push(`location: ${memory.profile.location}`)
    if (memory.profile.goals && memory.profile.goals.length > 0) {
      profileParts.push(`goals: ${memory.profile.goals.join(', ')}`)
    }
    if (profileParts.length > 0) {
      parts.push(`Profile: ${profileParts.join(', ')}`)
    }
  }

  // Preferences
  if (includePreferences && memory.preferences) {
    if (Array.isArray(memory.preferences)) {
      // Legacy array format
      if (memory.preferences.length > 0) {
        parts.push(`Preferences: ${memory.preferences.join(', ')}`)
      }
    } else {
      // New object format
      const prefEntries = Object.entries(memory.preferences)
        .filter(([_, value]) => value)
        .map(([key, value]) => `${key}: ${value}`)
      if (prefEntries.length > 0) {
        parts.push(`Preferences: ${prefEntries.join(', ')}`)
      }
    }
  }

  // Important facts (filtered by importance)
  if (memory.long_term_facts && memory.long_term_facts.length > 0) {
    const relevantFacts = memory.long_term_facts
      .filter(f => factImportance.includes(f.importance))
      .sort((a, b) => {
        // Sort by importance first, then by last_used
        const importanceOrder = { high: 3, medium: 2, low: 1 }
        const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance]
        if (importanceDiff !== 0) return importanceDiff

        // Then by last_used (most recent first)
        const aLastUsed = a.last_used || a.last_updated
        const bLastUsed = b.last_used || b.last_updated
        return new Date(bLastUsed).getTime() - new Date(aLastUsed).getTime()
      })
      .slice(0, maxFacts)
      .map(f => `- ${f.text}`)

    if (relevantFacts.length > 0) {
      parts.push(`Important facts:\n${relevantFacts.join('\n')}`)
    }
  }

  // Open tasks (if relevant)
  if (includeRelevantTasks && memory.open_tasks && memory.open_tasks.length > 0) {
    const openTasks = memory.open_tasks
      .filter(t => t.status !== 'done')
      .slice(0, 5)
      .map(t => `- ${t.description} (${t.status})`)

    if (openTasks.length > 0) {
      parts.push(`Open tasks:\n${openTasks.join('\n')}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * Get RAG context for a query
 * This is a wrapper around the existing RAG retrieval
 * Returns formatted text snippet for prompt insertion
 */
export async function getRagContextForQuery(
  userId: string,
  query: string,
  topK: number = 50,
  topN: number = 8
): Promise<string> {
  // This function will be implemented by calling the existing RAG system
  // For now, it's a placeholder that returns the format expected
  // The actual implementation should call retrieveChunksWithPython or similar
  
  // Import the RAG function
  const { retrieveChunksWithPython } = await import('../vector/queryWithOpenAIRag')
  
  try {
    const chunks = await retrieveChunksWithPython(query, topK, topN)
    
    if (!chunks || chunks.length === 0) {
      return 'No relevant knowledge found.'
    }

    // Format chunks into a structured text block
    const formattedChunks = chunks.map((chunk, idx) => 
      `[Source ${idx + 1}] ${chunk.source}:\n${chunk.text}`
    ).join('\n\n')

    return formattedChunks
  } catch (error) {
    console.error('Error retrieving RAG context:', error)
    return 'Error retrieving knowledge base.'
  }
}

