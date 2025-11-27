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
  const [conversations, setConversations] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [imageError, setImageError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Don't check authentication here - let middleware handle it
  // This prevents redirect loops

  // Load conversations on mount
  useEffect(() => {
    if (session?.user) {
      loadConversations()
    }
  }, [session])

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
    }
  }

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(
          data.messages.map((msg: any) => ({
            id: msg.id,
            sender: msg.sender.toLowerCase() as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }))
        )
        setConversationId(id)
        setShowHistory(false)
      }
    } catch (error) {
      console.error('Error loading conversation:', error)
    }
  }

  const startNewConversation = () => {
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
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
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              💬 צ&apos;אט טיפולי אישי
            </h1>
            <p className="text-sm text-gray-500 mt-1">מבוסס על חומרי הקורס</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {showHistory ? 'סגור היסטוריה' : 'היסטוריה'}
            </button>
            <button
              onClick={startNewConversation}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              שיחה חדשה
            </button>
            <div className="flex items-center gap-2">
              {session.user.image && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-8 h-8 rounded-full"
                  onError={() => setImageError(true)}
                  loading="lazy"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                  {(session.user.name || session.user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-700">{session.user.name || session.user.email}</span>
              <button
                onClick={() => signOut()}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* History Sidebar */}
      {showHistory && (
        <div className="absolute right-0 top-16 bottom-0 w-80 bg-white border-l border-gray-200 shadow-lg z-10 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">היסטוריית שיחות</h2>
            {conversations.length === 0 ? (
              <p className="text-gray-500 text-sm">אין שיחות קודמות</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-right p-3 rounded-lg border transition-colors ${
                      conversationId === conv.id
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <p className="font-medium text-sm">{conv.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {conv.messageCount} הודעות • {new Date(conv.updatedAt).toLocaleDateString('he-IL')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto px-4 py-6 space-y-4 ${showHistory ? 'mr-80' : ''}`}>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">שלום! 👋</p>
            <p>התחל שיחה על ידי הקלדת הודעה למטה.</p>
            <p className="text-sm mt-4 text-gray-400">נסה לשאול: &quot;מה זה מעגל התודעה?&quot;</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-3xl rounded-lg px-4 py-3 ${
                message.sender === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800 shadow-sm border border-gray-200'
              }`}
            >
              {message.content ? (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="animate-pulse flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-sm text-gray-500">מקליד...</span>
                </div>
              )}
              {message.content && (
                <p
                  className={`text-xs mt-2 ${
                    message.sender === 'user'
                      ? 'text-blue-100'
                      : 'text-gray-500'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="flex gap-2 max-w-4xl mx-auto items-end">
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
              // Prevent extensions from interfering
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
            className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows={1}
            disabled={isLoading}
            style={{ minHeight: '44px', maxHeight: '200px' }}
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
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 cursor-pointer active:bg-blue-700'
            } text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2 min-w-[100px] justify-center`}
            aria-disabled={isButtonDisabled}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>שולח...</span>
              </>
            ) : (
              'שלח'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

