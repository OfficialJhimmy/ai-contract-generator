// App.tsx - Improved UX with immediate feedback
import React, { useEffect, useRef, useState } from "react"
import { Loader2, FileDown, AlertCircle, CheckCircle2, Zap, Wifi, WifiOff } from "lucide-react"
import { useWebSocket } from "./hooks/useWebSocket"
import { exportToWord, exportToPDF } from "./lib/export"
import { formatWordCount, formatPageCount, stripHtmlTags, cn } from "./lib/utils"

const WS_URL = import.meta.env.VITE_WS_URL || "wss://YOUR-WEBSOCKET-ID.execute-api.us-east-1.amazonaws.com/prod"

const QUICK_PROMPTS = [
  "Draft an NDA between SaaS firms",
  "Consulting agreement (hourly)",
  "Mutual non-disparagement clause",
  "Termination & liability cap"
]

// Loading messages that cycle while waiting
const LOADING_MESSAGES = [
  "Initializing Claude AI...",
  "Analyzing your requirements...",
  "Structuring legal framework...",
  "Generating contract clauses...",
  "Refining legal language...",
  "Almost ready..."
]

function getNextRenderableToken(pending: string) {
  if (!pending) return { token: "", rest: "" }

  if (pending[0] === "<") {
    const endIdx = pending.indexOf(">")
    if (endIdx === -1) {
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

  return { token: pending[0], rest: pending.slice(1) }
}

function App(): JSX.Element {
  // Inputs
  const [prompt, setPrompt] = useState(
    "Draft Terms of Service for a cloud cyber SaaS company based in New York."
  )
  const [targetPages, setTargetPages] = useState(10)

  // WebSocket / generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStage, setGenerationStage] = useState<string>("")
  const [generatedContent, setGeneratedContent] = useState("")
  const [pendingBuffer, setPendingBuffer] = useState("")
  const [displayContent, setDisplayContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false)

  const { status, connect, disconnect, sendMessage, onMessage } = useWebSocket(WS_URL)

  const outputRef = useRef<HTMLDivElement | null>(null)
  const typingIntervalRef = useRef<number | null>(null)
  const loadingMessageIndexRef = useRef(0)
  const loadingIntervalRef = useRef<number | null>(null)

  // Connect on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Cycling loading messages while waiting for first chunk
  useEffect(() => {
    if (isGenerating && !hasReceivedFirstChunk) {
      // Start cycling through loading messages
      loadingMessageIndexRef.current = 0
      setGenerationStage(LOADING_MESSAGES[0])
      
      loadingIntervalRef.current = window.setInterval(() => {
        loadingMessageIndexRef.current = (loadingMessageIndexRef.current + 1) % LOADING_MESSAGES.length
        setGenerationStage(LOADING_MESSAGES[loadingMessageIndexRef.current])
      }, 3000) // Change message every 3 seconds
      
      return () => {
        if (loadingIntervalRef.current) {
          window.clearInterval(loadingIntervalRef.current)
          loadingIntervalRef.current = null
        }
      }
    } else {
      // Clear loading messages once we start receiving content
      if (loadingIntervalRef.current) {
        window.clearInterval(loadingIntervalRef.current)
        loadingIntervalRef.current = null
      }
      if (hasReceivedFirstChunk) {
        setGenerationStage("Streaming contract...")
      }
    }
  }, [isGenerating, hasReceivedFirstChunk])

  // Handle incoming WebSocket messages
  useEffect(() => {
    onMessage((message: any) => {
      console.log("📨 WS message:", message)

      if (!message || typeof message !== "object") {
        console.warn("Unexpected message shape:", message)
        return
      }

      const type = message.type

      if (type === "start") {
        setIsGenerating(true)
        setHasReceivedFirstChunk(false)
        setError(null)
        setSuccess(false)
        setGeneratedContent("")
        setPendingBuffer("")
        setDisplayContent("")
        setGenerationStage(LOADING_MESSAGES[0])
      } else if (type === "chunk") {
        const chunk = message.content || ""
        
        // First chunk received!
        if (!hasReceivedFirstChunk && chunk) {
          setHasReceivedFirstChunk(true)
          setGenerationStage("Streaming contract...")
        }
        
        setGeneratedContent((prev) => prev + chunk)
        setPendingBuffer((prev) => prev + chunk)
        setIsGenerating(true)
      } else if (type === "content") {
        const content = message.content || ""
        if (!hasReceivedFirstChunk && content) {
          setHasReceivedFirstChunk(true)
        }
        setGeneratedContent(content)
        setPendingBuffer((prev) => prev + content)
        setIsGenerating(false)
      } else if (type === "complete") {
        setIsGenerating(false)
        setSuccess(true)
        setGenerationStage("")
      } else if (type === "error") {
        setIsGenerating(false)
        setHasReceivedFirstChunk(false)
        setGenerationStage("")
        setError(message.error || "An error occurred during generation")
      } else {
        console.warn("Unhandled message type:", type)
      }
    })
  }, [onMessage, hasReceivedFirstChunk])

  // Typing effect
  useEffect(() => {
    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (!pendingBuffer) {
      return
    }

    const TYPING_INTERVAL_MS = 12

    typingIntervalRef.current = window.setInterval(() => {
      setPendingBuffer((prevPending) => {
        if (!prevPending) {
          if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current)
            typingIntervalRef.current = null
          }
          return ""
        }

        const { token, rest } = getNextRenderableToken(prevPending)
        setDisplayContent((prevDisplay) => prevDisplay + token)

        return rest
      })
    }, TYPING_INTERVAL_MS)

    return () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }
    }
  }, [pendingBuffer])

  // Auto-scroll
  useEffect(() => {
    if (!outputRef.current) return

    const el = outputRef.current
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [displayContent])

  const handleGenerate = () => {
    setError(null)
    setSuccess(false)
    setHasReceivedFirstChunk(false)

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

          {/* Enhanced Connection Status */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            {status === "connected" ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-medium">Connected</span>
              </>
            ) : status === "connecting" ? (
              <>
                <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                <span className="text-yellow-600">Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-red-600">Disconnected</span>
                <button 
                  onClick={connect}
                  className="ml-2 text-blue-600 hover:underline text-xs"
                >
                  Reconnect
                </button>
              </>
            )}
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
                disabled={isGenerating}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
            disabled={isGenerating}
            placeholder="Describe the contract you need..."
            className="w-full h-32 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 placeholder-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-600">Target pages:</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTargetPages(Math.max(1, targetPages - 1))}
                  disabled={isGenerating}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="w-12 text-center font-medium">{targetPages}</span>
                <button
                  onClick={() => setTargetPages(Math.min(50, targetPages + 1))}
                  disabled={isGenerating}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Generation Progress */}
        {isGenerating && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-blue-800 font-medium">{generationStage}</p>
                {hasReceivedFirstChunk && (
                  <div className="mt-2 h-1 bg-blue-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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

        {/* Generated Content Preview */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
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
            {!displayContent && isGenerating ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="text-sm text-gray-500">{generationStage}</span>
                </div>
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-3/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-2/5 animate-pulse"></div>
              </div>
            ) : !displayContent ? (
              <div className="text-center text-gray-400 py-12">
                <p>Your generated contract will appear here</p>
              </div>
            ) : (
              <div>
                <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                {isGenerating && (
                  <span aria-hidden className="inline-block ml-1 w-0.5 h-5 bg-blue-500 animate-pulse"></span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center text-sm text-gray-500">
          <p>Powered by Claude AI • WebSocket Streaming</p>
        </footer>
      </div>
    </div>
  )
}

export default App