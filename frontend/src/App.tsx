// App.tsx
import React, { useEffect, useRef, useState } from "react"
import { Loader2, FileDown, AlertCircle, CheckCircle2, Zap } from "lucide-react"
import { useWebSocket } from "./hooks/useWebSocket"
import { exportToWord, exportToPDF } from "./lib/export"
import { formatWordCount, formatPageCount, stripHtmlTags, cn } from "./lib/utils"

// WebSocket URL fallback
const WS_URL = import.meta.env.VITE_WS_URL || "wss://YOUR-WEBSOCKET-ID.execute-api.us-east-1.amazonaws.com/prod"

const QUICK_PROMPTS = [
  "Draft an NDA between SaaS firms",
  "Consulting agreement (hourly)",
  "Mutual non-disparagement clause",
  "Termination & liability cap"
]

/**
 * Utility: pick next renderable token from pending buffer
 * - If next char is '<' => consume until the next '>' (avoid typing inside HTML tags)
 * - If next char is '&' => consume until next ';' (HTML entity)
 * - Otherwise return a single character
 */
function getNextRenderableToken(pending: string) {
  if (!pending) return { token: "", rest: "" }

  if (pending[0] === "<") {
    const endIdx = pending.indexOf(">")
    if (endIdx === -1) {
      // no closing yet — as fallback, emit one char (prevents stuck)
      return { token: pending[0], rest: pending.slice(1) }
    }
    const token = pending.slice(0, endIdx + 1)
    return { token, rest: pending.slice(endIdx + 1) }
  }

  if (pending[0] === "&") {
    const endIdx = pending.indexOf(";")
    if (endIdx === -1) {
      return { token: pending[0], rest: pending.slice(1) }
    }
    const token = pending.slice(0, endIdx + 1)
    return { token, rest: pending.slice(endIdx + 1) }
  }

  // default: single character
  return { token: pending[0], rest: pending.slice(1) }
}

function App(): JSX.Element {
  // Inputs
  const [prompt, setPrompt] = useState(
    "Draft Terms of Service for a cloud cyber SaaS company based in New York."
  )
  const [targetPages, setTargetPages] = useState(10)

  // WebSocket / generation state
  const [isGenerating, setIsGenerating] = useState(false) // backend still generating
  const [generatedContent, setGeneratedContent] = useState("") // full assembled content as chunks arrive
  const [pendingBuffer, setPendingBuffer] = useState("") // buffer of raw incoming text waiting to be typed
  const [displayContent, setDisplayContent] = useState("") // what is shown in the UI (typed)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const { status, connect, disconnect, sendMessage, onMessage } = useWebSocket(WS_URL)

  // Refs
  const outputRef = useRef<HTMLDivElement | null>(null)
  const typingIntervalRef = useRef<number | null>(null)

  // Connect / disconnect websocket on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Handle incoming parsed messages from your useWebSocket hook
  useEffect(() => {
    // onMessage should call us with a parsed object like { type: 'chunk', content: '...' }
    onMessage((message: any) => {
      console.log("📨 WS message:", message)

      if (!message || typeof message !== "object") {
        console.warn("Unexpected message shape:", message)
        return
      }

      const type = message.type

      if (type === "start") {
        // Reset UI state for a new generation
        setIsGenerating(true)
        setError(null)
        setSuccess(false)
        setGeneratedContent("")
        setPendingBuffer("")
        setDisplayContent("")
      } else if (type === "chunk") {
        // Backend sends chunks (string) and indicates if last
        const chunk = message.content || ""
        setGeneratedContent((prev) => prev + chunk)
        // Append chunk to pending buffer for typing
        setPendingBuffer((prev) => prev + chunk)
        // Keep isGenerating true until 'complete'
        setIsGenerating(true)
      } else if (type === "content") {
        // Entire content in one go
        const content = message.content || ""
        setGeneratedContent(content)
        setPendingBuffer((prev) => prev + content)
        setIsGenerating(false) // backend finished sending "content", but we'll wait for "complete" normally
      } else if (type === "complete") {
        setIsGenerating(false)
        setSuccess(true)
        // If there's still pendingBuffer, typing effect will finish it
      } else if (type === "error") {
        setIsGenerating(false)
        setError(message.error || "An error occurred during generation")
      } else {
        console.warn("Unhandled message type:", type)
      }
    })
  }, [onMessage])

  // Typing effect: consume pendingBuffer into displayContent token by token
  useEffect(() => {
    // Clear previous interval if exists
    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (!pendingBuffer) {
      return
    }

    // Typing speed in ms. Lower = faster. Tune as you like.
    const TYPING_INTERVAL_MS = 12

    typingIntervalRef.current = window.setInterval(() => {
      setPendingBuffer((prevPending) => {
        if (!prevPending) {
          // nothing left, clear interval
          if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current)
            typingIntervalRef.current = null
          }
          return ""
        }

        const { token, rest } = getNextRenderableToken(prevPending)
        // Append token to displayed HTML string
        setDisplayContent((prevDisplay) => prevDisplay + token)

        return rest
      })
    }, TYPING_INTERVAL_MS)

    // cleanup if pendingBuffer changes or component unmounts
    return () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }
    }
  }, [pendingBuffer])

  // Auto-scroll output into view when displayContent changes
  useEffect(() => {
    if (!outputRef.current) return

    // Scroll to bottom smoothly
    const el = outputRef.current
    // Use requestAnimationFrame to ensure DOM updated
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [displayContent, isGenerating])

  // Helpers
  const handleGenerate = () => {
    setError(null)
    setSuccess(false)

    if (!prompt.trim()) {
      setError("Please enter a prompt")
      return
    }

    if (status !== "connected") {
      setError("Not connected to server. Retrying...")
      connect()
      return
    }

    console.log("🚀 Sending generation request")
    const sent = sendMessage({
      action: "generate",
      prompt: prompt.trim(),
      target_pages: targetPages
    })

    if (!sent) {
      setError("Failed to send request to server. Please try again.")
    } else {
      // UI will be reset on 'start' message from backend
    }
  }

  const handleExport = async (format: "word" | "pdf") => {
    if (!displayContent) {
      setError("No content to export")
      return
    }
    setIsExporting(true)
    try {
      const filename = `contract-${Date.now()}.${format === "word" ? "docx" : "pdf"}`
      if (format === "word") {
        await exportToWord(displayContent, filename)
      } else {
        await exportToPDF(displayContent, filename)
      }
    } catch (err) {
      console.error(err)
      setError(`Failed to export to ${format.toUpperCase()}`)
    } finally {
      setIsExporting(false)
    }
  }

  const wordCount = displayContent ? formatWordCount(stripHtmlTags(displayContent)) : 0
  const pageCount = formatPageCount(wordCount)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ContractForge
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            AI-powered legal contract generation with real-time streaming
          </p>

          {/* Connection Status */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <div className={cn(
              "w-2 h-2 rounded-full",
              status === "connected" && "bg-green-500 animate-pulse",
              status === "connecting" && "bg-yellow-500 animate-pulse",
              status === "disconnected" && "bg-gray-400",
              status === "error" && "bg-red-500"
            )} />
            <span className="text-gray-500">
              {status === "connected" && "Connected"}
              {status === "connecting" && "Connecting..."}
              {status === "disconnected" && "Disconnected"}
              {status === "error" && "Connection error"}
            </span>
          </div>
        </header>

        {/* Quick Prompts */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quick prompts:</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((quickPrompt) => (
              <button
                key={quickPrompt}
                onClick={() => setPrompt(quickPrompt)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
              >
                {quickPrompt}
              </button>
            ))}
          </div>
        </div>

        {/* Main Input Area */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 mb-8">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the contract you need..."
            className="w-full h-32 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 placeholder-gray-400"
          />

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-600">Target pages:</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTargetPages(Math.max(1, targetPages - 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                >
                  −
                </button>
                <span className="w-12 text-center font-medium">{targetPages}</span>
                <button
                  onClick={() => setTargetPages(Math.min(50, targetPages + 1))}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || status !== "connected"}
              className={cn(
                "px-8 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-200",
                isGenerating || status !== "connected"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg hover:scale-105"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Generate Contract
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && !isGenerating && displayContent && (
          <div className="mb-8 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-green-800 font-medium">Contract generated successfully!</p>
              <p className="text-green-600 text-sm">
                {wordCount.toLocaleString()} words • ~{pageCount} pages
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("word")}
                disabled={isExporting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                Word
              </button>
              <button
                onClick={() => handleExport("pdf")}
                disabled={isExporting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                PDF
              </button>
            </div>
          </div>
        )}

        {/* Generated Content Preview - Full-width ChatGPT style */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8" style={{ maxWidth: "100%" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">Generated Contract</h2>
            <span className="text-sm text-gray-500">
              {wordCount.toLocaleString()} words • ~{pageCount} pages
            </span>
          </div>

          <div
            ref={outputRef}
            className="prose prose-sm max-w-none overflow-auto p-3 rounded-md min-h-[280px] bg-white"
            style={{ maxHeight: "60vh" }}
          >
            {/* Skeleton while starting and no typed content yet */}
            {!displayContent && isGenerating ? (
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-3/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-2/5 animate-pulse"></div>
              </div>
            ) : (
              // Display typed HTML content safely
              <div>
                <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                {/* Typing caret while generation still ongoing */}
                {isGenerating && (
                  <span aria-hidden className="inline-block ml-1 animate-pulse text-gray-400">|</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center text-sm text-gray-500">
          <p>WebSocket: {WS_URL.substring(0, 80)}{WS_URL.length > 80 ? "..." : ""}</p>
        </footer>
      </div>
    </div>
  )
}

export default App