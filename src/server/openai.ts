// OpenAI API client for LLM and embeddings
import OpenAI from 'openai'

// Lazy initialization - read env vars at runtime
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. Please set it in your environment variables.')
  }
  
  // Return singleton instance
  if (!getOpenAIClient.instance) {
    getOpenAIClient.instance = new OpenAI({ apiKey })
  }
  return getOpenAIClient.instance
}
getOpenAIClient.instance = null as OpenAI | null

function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
}

let openaiClient: any = null

// Lazy load LLM client
async function getLLMClient() {
  if (!openaiClient) {
    openaiClient = await import('./llmClientOpenAI')
    console.log('✅ Using OpenAI API for LLM')
  }
  return openaiClient
}

/**
 * Generate embeddings for a text string using OpenAI
 * Returns 1536-dimensional vector (text-embedding-3-small)
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient()
    const response = await client.embeddings.create({
      model: getEmbeddingModel(),
      input: text,
    })
    return response.data[0]?.embedding || []
  } catch (error: any) {
    console.error('❌ OpenAI Embeddings API error:', error)
    throw new Error(`OpenAI Embeddings API error: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Generate embeddings for multiple texts using OpenAI
 * Returns array of 1536-dimensional vectors
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  try {
    const client = getOpenAIClient()
    const response = await client.embeddings.create({
      model: getEmbeddingModel(),
      input: texts,
    })
    return response.data.map(item => item.embedding)
  } catch (error: any) {
    console.error('❌ OpenAI Embeddings API error:', error)
    throw new Error(`OpenAI Embeddings API error: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Call Chat Completion API (using OpenAI only)
 */
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
  }
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  // Count and log tokens before sending
  try {
    const { countTokensForMessages, formatTokenCount } = await import('./utils/tokenCounter')
    const tokenCount = await countTokensForMessages(messages)
    console.log('\n' + '='.repeat(80))
    console.log('📊 חישוב טוקנים לפני שליחת הבקשה:')
    console.log(formatTokenCount(tokenCount))
    console.log('='.repeat(80) + '\n')
  } catch (error) {
    console.warn('⚠️  לא הצלחתי לחשב טוקנים:', error)
  }
  
  const client = await getLLMClient()
  return client.chatCompletion(messages, options)
}

export async function chatCompletionStream(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number
    maxTokens?: number
  }
): Promise<ReadableStream<Uint8Array>> {
  // Count and log tokens before sending
  try {
    const { countTokensForMessages, formatTokenCount } = await import('./utils/tokenCounter')
    const tokenCount = await countTokensForMessages(messages)
    console.log('\n' + '='.repeat(80))
    console.log('📊 חישוב טוקנים לפני שליחת הבקשה:')
    console.log(formatTokenCount(tokenCount))
    console.log('='.repeat(80) + '\n')
  } catch (error) {
    console.warn('⚠️  לא הצלחתי לחשב טוקנים:', error)
  }
  
  const client = await getLLMClient()
  return client.chatCompletionStream(messages, options)
}
