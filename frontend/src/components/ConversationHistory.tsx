import React from "react"
import { Clock, Trash2 } from "lucide-react"
import { cn } from "../lib/utils"

export interface Conversation {
  id: string
  prompt: string
  contract: string
  timestamp: number
}

interface ConversationHistoryProps {
  conversations: Conversation[]
  currentId: string | null
  onLoad: (conversation: Conversation) => void
  onDelete: (id: string) => void
  isDark: boolean
}

export function ConversationHistory({
  conversations,
  currentId,
  onLoad,
  onDelete,
  isDark
}: ConversationHistoryProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000)
      return mins < 1 ? "Just now" : `${mins}m ago`
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `${hours}h ago`
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000)
      return `${days}d ago`
    }
    
    // Format as date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className={cn(
        "text-xs font-semibold uppercase tracking-wider mb-3",
        isDark ? "text-gray-400" : "text-gray-600"
      )}>
        History
      </h2>
      
      {conversations.length === 0 ? (
        <p className={cn(
          "text-sm text-center py-8",
          isDark ? "text-gray-500" : "text-gray-400"
        )}>
          No conversations yet
        </p>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group relative rounded-lg p-3 cursor-pointer transition-all",
                currentId === conversation.id
                  ? isDark
                    ? "bg-blue-900/20 border border-blue-700"
                    : "bg-blue-50 border border-blue-200"
                  : isDark
                    ? "hover:bg-gray-800 border border-transparent"
                    : "hover:bg-gray-50 border border-transparent"
              )}
              onClick={() => onLoad(conversation)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium line-clamp-2 mb-1",
                    isDark ? "text-gray-200" : "text-gray-900"
                  )}>
                    {conversation.prompt}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-3 h-3" />
                    <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                      {formatTime(conversation.timestamp)}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(conversation.id)
                  }}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 p-1 rounded transition-all",
                    isDark
                      ? "hover:bg-red-900/20 text-red-400"
                      : "hover:bg-red-50 text-red-600"
                  )}
                  title="Delete conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}