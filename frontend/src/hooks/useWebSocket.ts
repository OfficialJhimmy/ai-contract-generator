import { useState, useEffect, useCallback, useRef } from "react"

export type WebSocketStatus = "disconnected" | "connecting" | "connected" | "error"

export interface WebSocketMessage {
  type: "start" | "content" | "chunk" | "complete" | "error"
  message?: string
  content?: string
  error?: string
  metadata?: any
}

export function useWebSocket(url: string | null) {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected")
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const messageHandlerRef = useRef<((message: WebSocketMessage) => void) | null>(null)
  
  const connect = useCallback(() => {
    if (!url) {
      console.error("❌ No WebSocket URL provided")
      return
    }
    
    try {
      console.log("🔌 Connecting to:", url)
      setStatus("connecting")
      setError(null)
      
      const ws = new WebSocket(url)
      wsRef.current = ws
      
      ws.onopen = () => {
        console.log("✅ WebSocket connected")
        setStatus("connected")
        setError(null)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("📨 Raw message:", data)
          
          // Call the message handler if it exists
          if (messageHandlerRef.current) {
            messageHandlerRef.current(data)
          }
        } catch (err) {
          console.error("❌ Failed to parse message:", err, event.data)
        }
      }
      
      ws.onerror = (event) => {
        console.error("❌ WebSocket error:", event)
        setStatus("error")
        setError("Connection error. Please try again.")
      }
      
      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason)
        setStatus("disconnected")
        wsRef.current = null
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Attempting to reconnect...")
          if (url) connect()
        }, 3000)
      }
      
    } catch (err) {
      console.error("❌ Failed to connect:", err)
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
  }, [])
  
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("📤 Sending:", message)
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    console.warn("⚠️ Cannot send message, WebSocket not connected")
    return false
  }, [])
  
  const onMessage = useCallback((callback: (message: WebSocketMessage) => void) => {
    messageHandlerRef.current = callback
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