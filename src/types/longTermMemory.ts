/**
 * Long-term Memory structure for persistent user information
 * This lives outside of specific conversations and is loaded before every LLM call
 * Based on AI_BEHAVIOR_SPEC.md specification
 */

export interface LongTermMemory {
  user_id: string
  
  profile?: {
    name?: string
    native_language?: 'he' | 'en' | 'other'
    level?: 'beginner' | 'intermediate' | 'advanced' | 'expert'
    role?: string                    // e.g. "Fullstack developer"
    location?: string
    goals?: string[]                 // long-term goals
    lang?: string                    // legacy support
    [key: string]: any               // allow additional fields
  }
  
  preferences?: {
    language?: 'he' | 'en'
    answer_length?: 'short' | 'medium' | 'long'
    code_examples?: 'none' | 'simple' | 'detailed'
    tone?: 'casual' | 'formal'
    prefers_bullets?: boolean
    other_notes?: string[]
  } | string[]                        // legacy: support old array format
  
  long_term_facts?: Array<{
    id: string
    text: string                     // "User teaches a course about X", etc.
    importance: 'low' | 'medium' | 'high'
    tags?: string[]                  // ["business", "course", "family"]
    embedding?: number[]             // optional – for similarity search
    last_updated: string
    last_used?: string
  }>
  
  open_tasks?: Array<{
    id: string
    description: string
    status: 'open' | 'in_progress' | 'done'
    created_at: string
    last_updated?: string
  }>
  
  conversation_themes?: string[]
  last_updated: string
  memory_summary?: string            // Condensed text version for prompts
}

/**
 * Default empty memory structure
 */
export function createEmptyMemory(userId: string): LongTermMemory {
  return {
    user_id: userId,
    profile: {},
    preferences: {},
    long_term_facts: [],
    open_tasks: [],
    conversation_themes: [],
    last_updated: new Date().toISOString(),
    memory_summary: '',
  }
}

/**
 * Memory update result from LLM extraction
 * Used by Memory Extractor to return structured updates
 */
export interface MemoryUpdateResult {
  new_facts?: Array<{
    text: string
    importance: 'low' | 'medium' | 'high'
    tags?: string[]
  }>
  new_preferences?: Array<{
    key: string
    value: string
  }>
  task_updates?: Array<{
    id: string | null
    description: string
    status: 'open' | 'in_progress' | 'done'
  }>
}

