/**
 * Token counting utilities using Python tiktoken
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

export interface TokenCount {
  total: number
  breakdown: {
    [role: string]: number
  }
  model: string
}

/**
 * Count tokens for chat messages using Python tiktoken
 */
export async function countTokensForMessages(
  messages: Array<{ role: string; content: string }>,
  model: string = 'gpt-4'
): Promise<TokenCount> {
  try {
    // Write messages to temporary JSON file
    const tempFile = join(tmpdir(), `tokens_${Date.now()}_${Math.random().toString(36).substring(7)}.json`)
    writeFileSync(tempFile, JSON.stringify(messages, null, 2), 'utf-8')

    try {
      // Call Python script
      const scriptPath = join(process.cwd(), 'scripts', 'calculateTokens.py')
      const { stdout, stderr } = await execAsync(
        `python3 "${scriptPath}" --messages "${tempFile}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      )
      
      if (stderr && !stderr.includes('NotOpenSSLWarning')) {
        console.warn('Token counter stderr:', stderr)
      }

      const result = JSON.parse(stdout.trim())
      return result as TokenCount
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempFile)
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    // Fallback: estimate tokens (rough approximation)
    console.warn('Token counting failed, using estimation:', error)
    return estimateTokens(messages, model)
  }
}

/**
 * Estimate tokens (fallback when Python script fails)
 * Rough approximation: ~1.3 tokens per word in Hebrew, ~4 tokens per message overhead
 */
function estimateTokens(
  messages: Array<{ role: string; content: string }>,
  model: string
): TokenCount {
  const breakdown: { [role: string]: number } = {}
  let total = 0

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    const role = msg.role || 'user'
    
    // Rough estimation: count words and multiply by 1.3 (Hebrew), add 4 for message overhead
    const words = content.split(/\s+/).length
    const estimated = Math.ceil(words * 1.3) + 4
    
    breakdown[role] = (breakdown[role] || 0) + estimated
    total += estimated
  }

  return {
    total,
    breakdown,
    model,
  }
}

/**
 * Format token count for logging
 */
export function formatTokenCount(count: TokenCount): string {
  const parts = [`📊 סה"כ טוקנים: ${count.total.toLocaleString()}`]
  
  if (Object.keys(count.breakdown).length > 0) {
    parts.push('\n📋 פירוט לפי role:')
    const sortedRoles = Object.entries(count.breakdown).sort((a, b) => b[1] - a[1]) // Sort by tokens descending
    for (const [role, tokens] of sortedRoles) {
      const percentage = ((tokens / count.total) * 100).toFixed(1)
      const roleName = role === 'system' ? 'System Prompt' : role === 'user' ? 'User Messages' : 'Assistant Messages'
      parts.push(`   ${roleName} (${role}): ${tokens.toLocaleString()} טוקנים (${percentage}%)`)
    }
  }
  
  parts.push(`\n💡 מודל: ${count.model}`)
  
  return parts.join('\n')
}

