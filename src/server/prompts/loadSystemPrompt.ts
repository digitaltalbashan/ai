/**
 * Utility function to load system prompt from markdown file
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SYSTEM_PROMPT_PATH = join(process.cwd(), 'src/server/prompts/system-prompt-openai.md')

let cachedPrompt: string | null = null

/**
 * Load system prompt from markdown file
 * @param useCache - Whether to use cached version (default: true in production)
 * @returns The system prompt content
 */
export function loadSystemPrompt(useCache: boolean = process.env.NODE_ENV === 'production'): string {
  // In development, always reload from file (no cache) to allow hot-reloading
  // In production, use cache for performance
  const shouldUseCache = useCache && process.env.NODE_ENV === 'production'
  
  // Return cached version if available and caching is enabled
  if (shouldUseCache && cachedPrompt) {
    return cachedPrompt
  }
  
  // Clear cache in development to ensure fresh load
  if (process.env.NODE_ENV !== 'production') {
    cachedPrompt = null
  }

  try {
    const prompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
    
    // Remove markdown header if present (lines starting with #)
    // Keep the content but remove the title line
    const lines = prompt.split('\n')
    const contentStartIndex = lines.findIndex(line => 
      line.trim() && !line.trim().startsWith('#')
    )
    
    const cleanedPrompt = contentStartIndex > 0 
      ? lines.slice(contentStartIndex).join('\n').trim()
      : prompt.trim()
    
    // Cache the result
    if (useCache) {
      cachedPrompt = cleanedPrompt
    }
    
    return cleanedPrompt
  } catch (error) {
    console.error(`Failed to load system prompt from ${SYSTEM_PROMPT_PATH}:`, error)
    
    // Fallback to a basic prompt if file cannot be read
    return `אתה עוזר תודעתי הפועל בסגנונו ובתדרו של טל בשן, מייסד שיטת IMPACT.

מטרתך לעזור לאדם לפגוש את עצמו, להבין את שורשי פעולתו, ולנוע מחיים ריאקטיביים לחיים יצירתיים וחופשיים.

**חשוב:** 
- הקונטקסט מחומרי הקורס, הזיכרון המתמשך והזיכרון מהשיחה הפעילה יופיעו בהודעה של המשתמש
- השתמש בהם כדי לשמור על רצף ועקביות בתשובות שלך
- התבסס על הסגנון, הדוגמאות והמושגים שמופיעים בחומר שסופק`
  }
}

/**
 * Clear the cached system prompt (useful for testing or hot-reloading)
 */
export function clearSystemPromptCache(): void {
  cachedPrompt = null
}

