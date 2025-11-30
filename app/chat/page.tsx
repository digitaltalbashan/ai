'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ChatRequest } from '@/src/types'

interface Message {
  id: string
  sender: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Don't check authentication here - let middleware handle it
  // This prevents redirect loops

  // Load the single conversation on mount
  useEffect(() => {
    if (session?.user) {
      loadSingleConversation()
    }
  }, [session])

  const loadSingleConversation = async () => {
    try {
      // Get the user's single conversation
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        const conversation = data.conversation
        
        console.log('📥 Loaded conversation:', conversation)
        
        // If there's a conversation, load its messages
        if (conversation && conversation.id) {
          await loadConversation(conversation.id)
        } else {
          // No conversation yet, it will be created on first message
          console.log('⚠️ No conversation found')
          setConversationId(null)
          setMessages([])
        }
      } else {
        console.error('❌ Failed to load conversation:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('❌ Error loading conversation:', error)
    }
  }

  const loadConversation = async (id: string) => {
    try {
      console.log('📥 Loading messages for conversation:', id)
      const response = await fetch(`/api/conversations/${id}`)
      if (response.ok) {
        const data = await response.json()
        console.log('📨 Received messages:', data.messages?.length || 0)
        
        if (data.messages && data.messages.length > 0) {
          const formattedMessages = data.messages.map((msg: any) => ({
            id: msg.id,
            sender: msg.sender.toLowerCase() as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }))
          console.log('✅ Setting messages:', formattedMessages.length)
          setMessages(formattedMessages)
        } else {
          console.log('⚠️ No messages in conversation')
          setMessages([])
        }
        setConversationId(id)
      } else {
        console.error('❌ Failed to load messages:', response.status, response.statusText)
        const errorData = await response.json().catch(() => ({}))
        console.error('Error details:', errorData)
      }
    } catch (error) {
      console.error('❌ Error loading conversation messages:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const currentInput = input.trim()
    setInput('')
    setIsLoading(true)
    setError(null)

    // Create a placeholder for the streaming assistant message
    const assistantMessageId = `msg_${Date.now() + 1}`
    const assistantMessage: Message = {
      id: assistantMessageId,
      sender: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, assistantMessage])

    try {
      const request: ChatRequest = {
        message: currentInput,
        conversationId,
      }

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP error! status: ${response.status}`)
      }

      // Get conversation ID from response headers
      const newConversationId = response.headers.get('X-Conversation-Id')
      if (newConversationId) {
        setConversationId(newConversationId)
      }

      // Read the streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulatedContent += chunk

        // Update the assistant message in real-time
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        )
        scrollToBottom()
      }

      // Final update to ensure all content is captured
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: accumulatedContent.trim() }
            : msg
        )
      )
      
      // Reload conversation to get all messages from server
      if (conversationId || newConversationId) {
        await loadConversation(conversationId || newConversationId || '')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setError(error instanceof Error ? error.message : 'An error occurred')
      // Remove the placeholder and add error message
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== assistantMessageId)
        return [
          ...filtered,
          {
            id: `msg_${Date.now() + 2}`,
            sender: 'assistant',
            content: 'מצטער, אירעה שגיאה. אנא נסה שוב.',
            timestamp: new Date(),
          },
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isButtonDisabled = isLoading || !input.trim()

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען...</p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return null // Will redirect
  }

  return (
    <div className="flex flex-col h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-white border-b border-[#c5c5c5] px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#32373c]">
              בית הספר למנהיגות תודעתית
            </h1>
            <p className="text-xs text-[#767676] mt-0.5">טל בשן AI</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {session.user.image && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-7 h-7 rounded-full"
                  onError={() => setImageError(true)}
                  loading="lazy"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#c5c5c5] flex items-center justify-center text-xs font-semibold text-white">
                  {(session.user.name || session.user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-[#32373c]">{session.user.name || session.user.email}</span>
              <button
                onClick={() => signOut()}
                className="px-3 py-1.5 text-xs text-[#767676] hover:text-[#32373c] hover:bg-[#fafafa] rounded transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto bg-[#fafafa]" dir="rtl">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {messages.length === 0 && (
            <div className="text-center text-[#767676] mt-16">
              <div className="mb-6">
                <svg className="w-16 h-16 mx-auto text-[#c5c5c5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-xl mb-2 text-[#32373c]">שלום! 👋</p>
              <p className="text-sm mb-6">התחל שיחה על ידי הקלדת הודעה למטה.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => setInput('מה זה מעגל התודעה?')}
                  className="px-4 py-2 text-sm bg-white hover:bg-[#fafafa] text-[#32373c] border border-[#c5c5c5] rounded-lg transition-colors shadow-sm"
                >
                  מה זה מעגל התודעה?
                </button>
                <button
                  onClick={() => setInput('מהי תודעה ראקטיבית?')}
                  className="px-4 py-2 text-sm bg-white hover:bg-[#fafafa] text-[#32373c] border border-[#c5c5c5] rounded-lg transition-colors shadow-sm"
                >
                  מהי תודעה ראקטיבית?
                </button>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`group w-full ${
                message.sender === 'user' ? 'bg-white' : 'bg-[#fafafa]'
              } border-b border-[#c5c5c5]/30`}
            >
              <div className="max-w-3xl mx-auto px-4 py-4">
                <div className={`flex gap-4 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {message.sender === 'user' ? (
                      <div className="w-8 h-8 rounded-full bg-[#32373c] flex items-center justify-center text-sm font-semibold text-white">
                        {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || 'U'}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#767676] flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Message Content */}
                  <div className={`flex-1 min-w-0 ${message.sender === 'user' ? 'text-right' : 'text-right'}`}>
                    {message.content ? (
                      <div className="prose max-w-none">
                        <div className="text-[#32373c] leading-7 whitespace-pre-wrap break-words">
                          {message.content.split('\n').map((line, i) => (
                            <span key={i}>
                              {line}
                              {i < message.content.split('\n').length - 1 && <br />}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[#767676]">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-[#c5c5c5] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-[#c5c5c5] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-[#c5c5c5] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="text-sm">מקליד...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {error && (
            <div className="max-w-3xl mx-auto px-4 py-4">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-[#c5c5c5] shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex gap-3 items-end bg-white rounded-2xl border-2 border-[#c5c5c5] shadow-sm focus-within:border-[#767676] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              onFocus={(e) => {
                e.stopPropagation()
              }}
              onBlur={(e) => {
                e.stopPropagation()
              }}
              onInput={(e) => {
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
              }}
              placeholder="הקלד הודעה..."
              className="flex-1 resize-none bg-transparent text-[#32373c] placeholder-[#767676] px-4 py-3 focus:outline-none disabled:opacity-50"
              rows={1}
              disabled={isLoading}
              style={{ minHeight: '52px', maxHeight: '200px' }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              data-bwignore="true"
              data-dashlane-ignore="true"
              data-bitwarden-ignore="true"
              data-keepassxc-ignore="true"
              name="chat-message"
              id="chat-message-input"
              role="textbox"
              aria-label="Chat message input"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isButtonDisabled) {
                  handleSend()
                }
              }}
              disabled={isButtonDisabled}
              className={`${
                isButtonDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[#fafafa] active:bg-[#f5f5f5] cursor-pointer'
              } p-2 rounded-lg transition-colors mr-2 mb-2`}
              aria-disabled={isButtonDisabled}
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-[#767676]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="h-5 w-5 text-[#32373c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-[#767676] text-center mt-2 px-4">
            העוזר יכול לעשות טעויות. בדוק מידע חשוב.
          </p>
        </div>
      </div>
    </div>
  )
}

