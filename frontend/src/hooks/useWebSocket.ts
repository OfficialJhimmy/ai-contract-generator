import { useState, useEffect, useCallback, useRef } from "react"

export type WebSocketStatus = "disconnected" | "connecting" | "connected" | "error"

export interface WebSocketMessage {
  type: "start" | "content" | "chunk" | "complete" | "error"
  message?: string
  content?: string
  error?: string
  metadata?: any
  // Chunk-specific fields
  chunk_index?: number
  is_last?: boolean
}

export function useWebSocket(url: string | null) {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected")
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<string[]>([])
  
  const connect = useCallback(() => {
    if (!url) return
    
    try {
      setStatus("connecting")
      setError(null)
      
      const ws = new WebSocket(url)
      wsRef.current = ws
      
      ws.onopen = () => {
        console.log("✅ WebSocket connected")
        setStatus("connected")
        setError(null)
        chunksRef.current = [] // Reset chunks
      }
      
      ws.onerror = (event) => {
        console.error("❌ WebSocket error:", event)
        setStatus("error")
        setError("Connection error. Please try again.")
      }
      
      ws.onclose = () => {
        console.log("🔌 WebSocket closed")
        setStatus("disconnected")
        wsRef.current = null
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (url) connect()
        }, 3000)
      }
      
    } catch (err) {
      console.error("Failed to connect:", err)
      setStatus("error")
      setError("Failed to connect to server")
    }
  }, [url])
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setStatus("disconnected")
    chunksRef.current = []
  }, [])
  
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    console.warn("⚠️ Cannot send message, WebSocket not connected")
    return false
  }, [])
  
  const onMessage = useCallback((callback: (message: WebSocketMessage) => void) => {
    if (wsRef.current) {
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Handle chunked messages
          if (data.type === 'chunk') {
            console.log(`📦 Received chunk ${data.chunk_index}, is_last: ${data.is_last}`)
            chunksRef.current.push(data.content || '')
            
            // If this is the last chunk, combine all chunks and send as content
            if (data.is_last) {
              const fullContent = chunksRef.current.join('')
              console.log(`✅ All chunks received, total length: ${fullContent.length}`)
              callback({
                type: 'content',
                content: fullContent,
                metadata: data.metadata
              })
              chunksRef.current = [] // Reset for next message
            }
          } else {
            // Regular message (not chunked)
            callback(data)
          }
        } catch (err) {
          console.error("Failed to parse message:", err)
        }
      }
    }
  }, [])
  
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])
  
  return {
    status,
    error,
    connect,
    disconnect,
    sendMessage,
    onMessage
  }
}