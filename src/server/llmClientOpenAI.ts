// OpenAI API client for testing
import OpenAI from 'openai'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini' // Use gpt-4o-mini for cost-effective testing

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not set in environment variables')
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null

/**
 * Call OpenAI Chat Completion API (non-streaming)
 */
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
  }
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY in environment variables.')
  }

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
      stream: false,
    })

    return {
      choices: response.choices.map((choice) => ({
        message: {
          content: choice.message.content || '',
        },
      })),
    }
  } catch (error: any) {
    console.error('❌ OpenAI API error:', error)
    throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Call OpenAI Chat Completion API (streaming)
 */
export async function chatCompletionStream(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number
    maxTokens?: number
  }
): Promise<ReadableStream<Uint8Array>> {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY in environment variables.')
  }

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
      stream: true,
    })

    // Convert OpenAI stream to ReadableStream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              controller.enqueue(encoder.encode(content))
            }
            
            if (chunk.choices[0]?.finish_reason) {
              controller.close()
              break
            }
          }
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return readable
  } catch (error: any) {
    console.error('❌ OpenAI API streaming error:', error)
    throw new Error(`OpenAI API streaming error: ${error.message || 'Unknown error'}`)
  }
}

