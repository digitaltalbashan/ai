'use client'

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface User {
  id: string
  name: string | null
  email: string | null
  emailVerified: Date | null
  image: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    conversations: number
    memories: number
    accounts: number
    sessions: number
  }
}

interface Conversation {
  id: string
  title: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    messages: number
  }
}

interface Memory {
  id: string
  summary: string
  memoryType: string
  createdAt: Date
  updatedAt?: Date
}

interface LongTermMemory {
  user_id: string
  profile?: Record<string, any>
  preferences?: string[] | Record<string, any>
  long_term_facts?: Array<{
    id: string
    text: string
    importance: 'low' | 'medium' | 'high'
    last_updated: string
    last_used?: string
  }>
  conversation_themes?: string[]
  memory_summary?: string
  last_updated: string
}

interface Message {
  id: string
  sender: 'USER' | 'ASSISTANT'
  content: string
  createdAt: Date
}

interface ConversationDetail extends Conversation {
  messages: Message[]
  user: {
    id: string
    name: string | null
    email: string | null
  }
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modals state
  const [showConversationsModal, setShowConversationsModal] = useState(false)
  const [showMemoriesModal, setShowMemoriesModal] = useState(false)
  const [showConversationDetailModal, setShowConversationDetailModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [userToReset, setUserToReset] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [longTermMemory, setLongTermMemory] = useState<LongTermMemory | null>(null)
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (status === "loading") return

    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/admin")
      return
    }

    if (session?.user?.email !== "tzmoyal@gmail.com") {
      setError("Unauthorized: Admin access required")
      setLoading(false)
      return
    }

    // Fetch users
    fetchUsers()
  }, [session, status, router])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/users")
      
      if (response.status === 403) {
        setError("Unauthorized: Admin access required")
        setLoading(false)
        return
      }

      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }

      const data = await response.json()
      setUsers(data.users)
      setError(null)
    } catch (err) {
      console.error("Error fetching users:", err)
      setError("Failed to load users")
    } finally {
      setLoading(false)
    }
  }

  const fetchConversations = async (userId: string) => {
    try {
      setLoadingData(true)
      const response = await fetch(`/api/admin/users/${userId}/conversations`)
      
      if (!response.ok) {
        throw new Error("Failed to fetch conversations")
      }

      const data = await response.json()
      setConversations(data.conversations)
      setShowConversationsModal(true)
    } catch (err) {
      console.error("Error fetching conversations:", err)
      alert("שגיאה בטעינת השיחות")
    } finally {
      setLoadingData(false)
    }
  }

  const fetchMemories = async (userId: string) => {
    try {
      setLoadingData(true)
      const response = await fetch(`/api/admin/users/${userId}/memories`)
      
      if (!response.ok) {
        throw new Error("Failed to fetch memories")
      }

      const data = await response.json()
      setMemories(data.activeMemories || [])
      setLongTermMemory(data.longTermMemory || null)
      setShowMemoriesModal(true)
    } catch (err) {
      console.error("Error fetching memories:", err)
      alert("שגיאה בטעינת הזיכרונות")
    } finally {
      setLoadingData(false)
    }
  }

  const fetchConversationDetail = async (userId: string, conversationId: string) => {
    try {
      setLoadingData(true)
      const response = await fetch(`/api/admin/users/${userId}/conversations/${conversationId}`)
      
      if (!response.ok) {
        throw new Error("Failed to fetch conversation detail")
      }

      const data = await response.json()
      setConversationDetail(data.conversation)
      setShowConversationDetailModal(true)
    } catch (err) {
      console.error("Error fetching conversation detail:", err)
      alert("שגיאה בטעינת פרטי השיחה")
    } finally {
      setLoadingData(false)
    }
  }

  const handleViewConversations = async (user: User) => {
    setSelectedUser(user)
    
    // Since each user has only one conversation, fetch it directly
    try {
      setLoadingData(true)
      const response = await fetch(`/api/admin/users/${user.id}/conversations`)
      
      if (!response.ok) {
        throw new Error("Failed to fetch conversation")
      }

      const data = await response.json()
      const conversations = data.conversations || []
      
      if (conversations.length > 0) {
        // If there's a conversation, show it directly (no need for list)
        const conversation = conversations[0]
        await fetchConversationDetail(user.id, conversation.id)
      } else {
        setConversations([])
        setShowConversationsModal(true)
      }
    } catch (err) {
      console.error("Error fetching conversation:", err)
      alert("שגיאה בטעינת השיחה")
    } finally {
      setLoadingData(false)
    }
  }

  const handleViewMemories = (user: User) => {
    setSelectedUser(user)
    fetchMemories(user.id)
  }

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user)
    setShowDeleteConfirmModal(true)
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete user")
      }

      // Refresh users list
      await fetchUsers()
      setShowDeleteConfirmModal(false)
      setUserToDelete(null)
    } catch (err: any) {
      console.error("Error deleting user:", err)
      alert(err.message || "שגיאה במחיקת המשתמש")
    } finally {
      setDeleting(false)
    }
  }

  const handleResetUser = (user: User) => {
    setUserToReset(user)
    setShowResetConfirmModal(true)
  }

  const confirmResetUser = async () => {
    if (!userToReset) return

    try {
      setResetting(true)
      const response = await fetch(`/api/admin/users/${userToReset.id}/reset`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to reset user data")
      }

      const data = await response.json()
      
      // Refresh users list
      await fetchUsers()
      setShowResetConfirmModal(false)
      setUserToReset(null)
      
      // Show success message
      alert(`✅ נתוני המשתמש אופסו בהצלחה!\n\nנמחקו:\n- ${data.deleted.messages} הודעות\n- ${data.deleted.conversations} שיחות\n- ${data.deleted.memories} זיכרונות\n- ${data.deleted.contexts} קונטקסטים`)
    } catch (err: any) {
      console.error("Error resetting user data:", err)
      alert(err.message || "שגיאה באיפוס נתוני המשתמש")
    } finally {
      setResetting(false)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">טוען...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">גישה נדחתה</h1>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => router.push("/chat")}
            className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            חזור לצ&apos;אט
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">דשבורד אדמין</h1>
              <p className="mt-2 text-gray-600">ניהול משתמשים במערכת</p>
            </div>
            <button
              onClick={() => router.push("/chat")}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              חזור לצ&apos;אט
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-sm font-medium text-gray-500">סה&apos;&quot;כ משתמשים</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-sm font-medium text-gray-500">משתמשים עם שיחה</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">
              {users.filter(u => u._count.conversations > 0).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              מתוך {users.length} משתמשים
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-sm font-medium text-gray-500">זיכרונות</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {users.reduce((sum, user) => sum + user._count.memories, 0)}
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-sm font-medium text-gray-500">משתמשים מאומתים</div>
            <div className="mt-2 text-3xl font-bold text-purple-600">
              {users.filter((user) => user.emailVerified).length}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">כל המשתמשים</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    משתמש
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    אימייל
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    תאריך הרשמה
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    שיחה
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    זיכרונות
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סטטוס
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      אין משתמשים במערכת
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {user.image ? (
                              <img
                                className="h-10 w-10 rounded-full"
                                src={user.image}
                                alt={user.name || "User"}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <span className="text-gray-600 font-medium">
                                  {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?"}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="mr-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name || "ללא שם"}
                            </div>
                            <div className="text-sm text-gray-500">ID: {user.id.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.email || "ללא אימייל"}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(user.createdAt).toLocaleDateString("he-IL", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleTimeString("he-IL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user._count.conversations > 0 ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            יש שיחה
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            אין שיחה
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user._count.memories}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.emailVerified ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            מאומת
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            לא מאומת
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleViewConversations(user)}
                            disabled={loadingData || user._count.conversations === 0}
                            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                          >
                            {user._count.conversations > 0 ? 'צפה בשיחה' : 'אין שיחה'}
                          </button>
                          <button
                            onClick={() => handleViewMemories(user)}
                            disabled={loadingData || user._count.memories === 0}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                          >
                            זיכרונות ({user._count.memories})
                          </button>
                          <button
                            onClick={() => handleResetUser(user)}
                            disabled={resetting}
                            className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            title="אפס נתונים - כאילו משתמש חדש"
                          >
                            🔄 אפס נתונים
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleting || user.email === "tzmoyal@gmail.com"}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            title={user.email === "tzmoyal@gmail.com" ? "לא ניתן למחוק את משתמש האדמין" : "מחק משתמש"}
                          >
                            🗑️ מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Conversations Modal - Only shown if no conversation exists */}
      {showConversationsModal && selectedUser && conversations.length === 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">אין שיחה</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowConversationsModal(false)
                  setConversations([])
                  setSelectedUser(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-8 text-center">
              <p className="text-gray-600">למשתמש זה עדיין אין שיחה.</p>
              <p className="text-sm text-gray-500 mt-2">השיחה תיווצר אוטומטית כשהמשתמש ישלח הודעה ראשונה.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowConversationsModal(false)
                  setConversations([])
                  setSelectedUser(null)
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memories Modal */}
      {showMemoriesModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">זיכרונות של {selectedUser.name || selectedUser.email}</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowMemoriesModal(false)
                  setMemories([])
                  setLongTermMemory(null)
                  setSelectedUser(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingData ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto" />
                  <p className="mt-4 text-gray-600">טוען זיכרונות...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Active Conversation Memory */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      זיכרון פעיל (Active Conversation Memory)
                    </h3>
                    {memories.length === 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
                        אין זיכרון פעיל למשתמש זה
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {memories.map((memory) => (
                          <div key={memory.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                            <div className="flex items-center justify-between mb-3">
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                                {memory.memoryType}
                              </span>
                              <div className="text-xs text-gray-500">
                                <div>נוצר: {new Date(memory.createdAt).toLocaleString("he-IL")}</div>
                                {memory.updatedAt && (
                                  <div>עודכן: {new Date(memory.updatedAt).toLocaleString("he-IL")}</div>
                                )}
                              </div>
                            </div>
                            <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">{memory.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Long-term Memory */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      זיכרון מתמשך (Long-term Memory)
                    </h3>
                    {!longTermMemory || (Object.keys(longTermMemory).length === 0) ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
                        אין זיכרון מתמשך למשתמש זה
                      </div>
                    ) : (
                      <div className="border border-green-200 rounded-lg p-4 bg-green-50 space-y-4">
                        {/* Profile */}
                        {longTermMemory.profile && Object.keys(longTermMemory.profile).length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">👤 פרופיל:</h4>
                            <div className="bg-white rounded p-3 text-sm">
                              {Object.entries(longTermMemory.profile).map(([key, value]) => (
                                value && (
                                  <div key={key} className="mb-1">
                                    <span className="font-medium">{key}:</span> {String(value)}
                                  </div>
                                )
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Preferences */}
                        {longTermMemory.preferences && (
                          Array.isArray(longTermMemory.preferences) ? (
                            longTermMemory.preferences.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">⭐ העדפות:</h4>
                                <div className="bg-white rounded p-3">
                                  <ul className="list-disc list-inside space-y-1 text-sm">
                                    {longTermMemory.preferences.map((pref, idx) => (
                                      <li key={idx}>{pref}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )
                          ) : (
                            Object.keys(longTermMemory.preferences).length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">⭐ העדפות:</h4>
                                <div className="bg-white rounded p-3 text-sm">
                                  {JSON.stringify(longTermMemory.preferences, null, 2)}
                                </div>
                              </div>
                            )
                          )
                        )}

                        {/* Long-term Facts */}
                        {longTermMemory.long_term_facts && longTermMemory.long_term_facts.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">📚 עובדות מתמשכות ({longTermMemory.long_term_facts.length}):</h4>
                            <div className="space-y-2">
                              {longTermMemory.long_term_facts.map((fact, idx) => (
                                <div key={fact.id} className="bg-white rounded p-3 border-l-4 border-green-500">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                      fact.importance === 'high' ? 'bg-red-100 text-red-800' :
                                      fact.importance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {fact.importance.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      עודכן: {new Date(fact.last_updated).toLocaleDateString("he-IL")}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-900">{fact.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Conversation Themes */}
                        {longTermMemory.conversation_themes && longTermMemory.conversation_themes.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">🎯 נושאי שיחה:</h4>
                            <div className="bg-white rounded p-3">
                              <div className="flex flex-wrap gap-2">
                                {longTermMemory.conversation_themes.map((theme, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                                    {theme}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Memory Summary */}
                        {longTermMemory.memory_summary && (
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">📄 סיכום זיכרון:</h4>
                            <div className="bg-white rounded p-3 text-sm text-gray-900 whitespace-pre-wrap">
                              {longTermMemory.memory_summary}
                            </div>
                          </div>
                        )}

                        {/* Last Updated */}
                        <div className="text-xs text-gray-500 pt-2 border-t border-green-200">
                          עודכן לאחרונה: {new Date(longTermMemory.last_updated).toLocaleString("he-IL")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conversation Detail Modal */}
      {showConversationDetailModal && conversationDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {conversationDetail.title || "שיחה ללא כותרת"}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {conversationDetail.user.name || conversationDetail.user.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowConversationDetailModal(false)
                  setConversationDetail(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingData ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                  <p className="mt-4 text-gray-600">טוען הודעות...</p>
                </div>
              ) : conversationDetail.messages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">אין הודעות בשיחה זו</div>
              ) : (
                <div className="space-y-4">
                  {conversationDetail.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'USER' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          message.sender === 'USER'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <div className="text-sm font-medium mb-1">
                          {message.sender === 'USER' ? 'משתמש' : 'עוזר'}
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        <div className="text-xs mt-2 opacity-75">
                          {new Date(message.createdAt).toLocaleString("he-IL", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirmModal && userToReset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">איפוס נתוני משתמש</h2>
            </div>
            <div className="px-6 py-4">
              <div className="mb-4">
                <p className="text-gray-700 mb-2">
                  האם אתה בטוח שברצונך לאפס את כל הנתונים של המשתמש הבא?
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900">
                    {userToReset.name || "ללא שם"}
                  </p>
                  <p className="text-sm text-gray-600">{userToReset.email}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    <p>שיחות: {userToReset._count.conversations}</p>
                    <p>זיכרונות: {userToReset._count.memories}</p>
                  </div>
                </div>
                <p className="text-sm text-orange-600 mt-4 font-semibold">
                  ⚠️ פעולה זו תמחק את כל הנתונים של המשתמש (שיחות, הודעות, זיכרונות, קונטקסט) ותאתחל אותו כאילו הוא משתמש חדש. המשתמש עצמו יישאר במערכת.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  הפעולה לא ניתנת לביטול!
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetConfirmModal(false)
                  setUserToReset(null)
                }}
                disabled={resetting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={confirmResetUser}
                disabled={resetting}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
              >
                {resetting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    מאפס...
                  </>
                ) : (
                  "אפס נתונים"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">מחיקת משתמש</h2>
            </div>
            <div className="px-6 py-4">
              <div className="mb-4">
                <p className="text-gray-700 mb-2">
                  האם אתה בטוח שברצונך למחוק את המשתמש הבא?
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900">
                    {userToDelete.name || "ללא שם"}
                  </p>
                  <p className="text-sm text-gray-600">{userToDelete.email}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    <p>שיחות: {userToDelete._count.conversations}</p>
                    <p>זיכרונות: {userToDelete._count.memories}</p>
                  </div>
                </div>
                <p className="text-sm text-red-600 mt-4 font-semibold">
                  ⚠️ פעולה זו תמחק את כל הנתונים הקשורים למשתמש (שיחות, זיכרונות, וכו&apos;) ולא ניתן לבטל אותה!
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false)
                  setUserToDelete(null)
                }}
                disabled={deleting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    מוחק...
                  </>
                ) : (
                  "מחק משתמש"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

