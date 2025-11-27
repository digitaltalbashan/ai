// Shared TypeScript types

export interface KnowledgeChunkData {
  id: string;
  text: string;
  metadata?: Record<string, any>;
  source?: string;
  lesson?: string;
  order?: number;
  tags?: string[];
}

export interface UserMemoryData {
  userId: string;
  summary: string;
  memoryType?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string | null;
  // userId is now obtained from session, not from request
}

export interface ChatResponse {
  message: string;
  conversationId: string;
}

