import React, { useEffect, useRef, useState } from "react"
import { Loader2, FileDown, AlertCircle, CheckCircle2, Zap, Menu, X, Plus, Sun, Moon } from "lucide-react"
import { useWebSocket } from "./hooks/useWebSocket"
import { exportToWord, exportToPDF } from "./lib/export"
import { formatWordCount, formatPageCount, stripHtmlTags, cn } from "./lib/utils"
import { ConversationHistory, type Conversation } from "./components/ConversationHistory"
import { ContractPreview } from "./components/ContractPreview"

// First Read Brand Colors (extracted from website)
const BRAND_COLORS = {
  primary: "#2563eb", // Blue
  secondary: "#7c3aed", // Purple
  accent: "#06b6d4", // Cyan
  dark: "#0f172a", // Slate 900
  lightBg: "#f8fafc" // Slate 50
}

// WebSocket URL - Replace with your actual URL
const WS_URL = import.meta.env.VITE_WS_URL || "wss://lmmxz22twa.execute-api.us-east-1.amazonaws.com/prod"

const QUICK_PROMPTS = [
  "Draft an NDA between SaaS firms",
  "Consulting agreement (hourly)",
  "Mutual non-disparagement clause",
  "Termination & liability cap"
]

function App(): JSX.Element {
  // Theme
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme")
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
  })
  
  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  // Inputs
  const [prompt, setPrompt] = useState(
    "Draft Terms of Service for a cloud cyber SaaS company based in New York."
  )
  const [targetPages, setTargetPages] = useState(10)

  // WebSocket / generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState("")
  const [displayContent, setDisplayContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Conversation history
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem("conversations")
    return saved ? JSON.parse(saved) : []
  })
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  const { status, connect, disconnect, sendMessage, onMessage } = useWebSocket(WS_URL)

  // Refs
  const outputRef = useRef<HTMLDivElement | null>(null)
  const typingIntervalRef = useRef<number | null>(null)
  const displayIndexRef = useRef(0)

  // Theme effect
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }, [isDark])

  // Save conversations to localStorage
  useEffect(() => {
    localStorage.setItem("conversations", JSON.stringify(conversations))
  }, [conversations])

  // Connect WebSocket on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Utility function to clean markdown code fences
  const cleanMarkdownFences = (content: string): string => {
    // Remove ```html, ```xml, ``` and other code fence markers
    return content
      .replace(/^```[\w]*\n?/gm, '')  // Remove opening code fences (```html, ```xml, etc.)
      .replace(/\n?```$/gm, '')        // Remove closing code fences
      .replace(/```\n?/g, '')          // Remove any remaining ``` markers
      .trim()
  }

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
        setError(null)
        setSuccess(false)
        setGeneratedContent("")
        setDisplayContent("")
        displayIndexRef.current = 0
      } else if (type === "chunk") {
        const chunk = message.content || ""
        // Clean each chunk as it arrives
        setGeneratedContent((prev) => {
          const combined = prev + chunk
          return cleanMarkdownFences(combined)
        })
      } else if (type === "content") {
        const content = message.content || ""
        setGeneratedContent(cleanMarkdownFences(content))
      } else if (type === "complete") {
        setIsGenerating(false)
        setSuccess(true)
        
        // Clean the final content before saving
        setGeneratedContent((prev) => {
          const finalContent = cleanMarkdownFences(prev)
          
          // Save to conversation history with cleaned content
          const newConversation: Conversation = {
            id: Date.now().toString(),
            prompt: prompt,
            contract: finalContent,
            timestamp: Date.now()
          }
          setConversations(convs => [newConversation, ...convs])
          setCurrentConversationId(newConversation.id)
          
          return finalContent
        })
      } else if (type === "error") {
        setIsGenerating(false)
        setError(message.error || "An error occurred during generation")
      }
    })
  }, [onMessage, prompt])

  // FIXED TYPING EFFECT - Character by character, no duplication
  useEffect(() => {
    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current)
    }

    if (!generatedContent) {
      displayIndexRef.current = 0
      setDisplayContent("")
      return
    }

    // If we've already displayed all content, don't restart
    if (displayIndexRef.current >= generatedContent.length) {
      return
    }

    const TYPING_SPEED_MS = 8 // Very fast for production

    typingIntervalRef.current = window.setInterval(() => {
      displayIndexRef.current += 1
      
      if (displayIndexRef.current <= generatedContent.length) {
        setDisplayContent(generatedContent.substring(0, displayIndexRef.current))
      } else {
        // Done typing
        if (typingIntervalRef.current) {
          window.clearInterval(typingIntervalRef.current)
          typingIntervalRef.current = null
        }
      }
    }, TYPING_SPEED_MS)

    return () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
      }
    }
  }, [generatedContent])

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [displayContent])

  // Handlers
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

  const handleNewConversation = () => {
    setPrompt("")
    setGeneratedContent("")
    setDisplayContent("")
    setSuccess(false)
    setError(null)
    setCurrentConversationId(null)
    displayIndexRef.current = 0
  }

  const handleLoadConversation = (conversation: Conversation) => {
    setPrompt(conversation.prompt)
    setGeneratedContent(conversation.contract)
    setDisplayContent(conversation.contract)
    setCurrentConversationId(conversation.id)
    setSuccess(true)
    displayIndexRef.current = conversation.contract.length
  }

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id))
    if (currentConversationId === id) {
      handleNewConversation()
    }
  }

  const wordCount = displayContent ? formatWordCount(stripHtmlTags(displayContent)) : 0
  const pageCount = formatPageCount(wordCount)

  return (
    <div className={cn(
      "min-h-screen flex transition-colors duration-200",
      isDark ? "bg-gray-950" : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
    )}>
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-in-out",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200",
        "border-r w-80",
        sidebarOpen ? "translate-x-0" : "-translate-x-full", "lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-inherit">
          <div className="flex items-center gap-3">
            <div 
              className="w-[50px] h-10 rounded-xl flex items-center justify-center"
            >
              <img src="./first-read-logo.png" alt="First Read Logo" />
            </div>
            <div>
              <h2 className={cn("text-2xl", isDark ? "text-white" : "text-black")}>FirstRead</h2>
              <p className={cn(
                "text-xs",
                isDark ? "text-gray-400" : "text-gray-600"
              )}>
                Contract Generator
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "lg:hidden p-2 rounded-lg",
              isDark ? "hover:bg-gray-800 text-white" : "hover:bg-gray-100 text-white"
            )}
          >
            <X className={cn("w-5 h-5", isDark ? "text-white" : "text-black")} />
          </button>
        </div>

        <div className="p-4 border-b border-inherit">
          <button
            onClick={handleNewConversation}
            className={cn(
              "w-full px-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all",
              isDark
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg text-white"
            )}
          >
            <Plus className="w-5 h-5" />
            New Contract
          </button>
        </div>

        <ConversationHistory
          conversations={conversations}
          currentId={currentConversationId}
          onLoad={handleLoadConversation}
          onDelete={handleDeleteConversation}
          isDark={isDark}
        />

        <div className="mt-auto p-4 border-t border-inherit">
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-xs",
              isDark ? "text-gray-400" : "text-gray-600"
            )}>
              {status === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
            </span>
            <button
              onClick={() => setIsDark(!isDark)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isDark ? "hover:bg-gray-800 text-white" : "hover:bg-gray-100"
              )}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-300",
        sidebarOpen ? "lg:ml-80" : "ml-0", "lg:ml-80"
      )}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-2 py-8">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className={cn(
                  "p-2 rounded-lg lg:hidden",
                  isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"
                )}
              >
                <Menu className={cn("w-6 h-6", isDark ? "text-white" : "text-black")} />
              </button>
              
              <div className="flex items-center gap-2 text-sm">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  status === "connected" && "bg-green-500 animate-pulse",
                  status === "connecting" && "bg-yellow-500 animate-pulse",
                  status === "disconnected" && "bg-gray-400",
                  status === "error" && "bg-red-500"
                )} />
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                  {status === "connected" && "Connected"}
                  {status === "connecting" && "Connecting..."}
                  {status === "disconnected" && "Disconnected"}
                  {status === "error" && "Connection error"}
                </span>
              </div>
            </div>

            <div className="text-center mb-6">
              <h1 
                className="text-4xl font-bold mb-2"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent"
                }}
              >
                AI Contract Generator
              </h1>
              <p className={cn(
                "text-lg",
                isDark ? "text-gray-400" : "text-gray-600"
              )}>
                Generate professional legal contracts in seconds
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="mb-6">
              <h3 className={cn(
                "text-sm font-medium mb-3",
                isDark ? "text-gray-400" : "text-gray-700"
              )}>
                Quick prompts:
              </h3>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((quickPrompt) => (
                  <button
                    key={quickPrompt}
                    onClick={() => setPrompt(quickPrompt)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm transition-all",
                      isDark
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        : "bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50 border border-gray-200"
                    )}
                  >
                    {quickPrompt}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Input Area */}
          <div className={cn(
            "rounded-2xl shadow-xl border p-8 mb-8",
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
          )}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the contract you need..."
              className={cn(
                "w-full h-32 px-4 py-3 border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400",
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-100"
                  : "bg-white border-gray-200 text-gray-800"
              )}
            />

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className={cn(
                  "text-sm",
                  isDark ? "text-gray-400" : "text-gray-600"
                )}>
                  Target pages:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTargetPages(Math.max(1, targetPages - 1))}
                    className={cn(
                      "w-8 h-8 rounded-lg border flex items-center justify-center",
                      isDark
                        ? "border-gray-700 hover:bg-gray-800"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    −
                  </button>
                  <span className={cn(
                    "w-12 text-center font-medium",
                    isDark ? "text-gray-200" : "text-gray-900"
                  )}>
                    {targetPages}
                  </span>
                  <button
                    onClick={() => setTargetPages(Math.min(50, targetPages + 1))}
                    className={cn(
                      "w-8 h-8 rounded-lg border flex items-center justify-center",
                      isDark
                        ? "border-gray-700 hover:bg-gray-800"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || status !== "connected"}
                className={cn(
                  "px-8 py-3 rounded-xl font-medium flex items-center gap-2 transition-all duration-200 cursor-pointer",
                  isGenerating || status !== "connected"
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600"
                    : "text-white hover:shadow-lg hover:scale-105"
                )}
                style={
                  !(isGenerating || status !== "connected")
                    ? {
                        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
                      }
                    : undefined
                }
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Generate Contract
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={cn(
              "mb-8 rounded-xl p-4 flex items-start gap-3 border",
              isDark
                ? "bg-red-900/20 border-red-800"
                : "bg-red-50 border-red-200"
            )}>
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className={cn(
                  "font-medium",
                  isDark ? "text-red-400" : "text-red-800"
                )}>
                  Error
                </p>
                <p className={cn(
                  "text-sm",
                  isDark ? "text-red-300" : "text-red-600"
                )}>
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && !isGenerating && displayContent && (
            <div className={cn(
              "mb-8 rounded-xl p-4 flex items-start gap-3 border",
              isDark
                ? "bg-green-900/20 border-green-800"
                : "bg-green-50 border-green-200"
            )}>
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className={cn(
                  "font-medium",
                  isDark ? "text-green-400" : "text-green-800"
                )}>
                  Contract generated successfully!
                </p>
                <p className={cn(
                  "text-sm",
                  isDark ? "text-green-300" : "text-green-600"
                )}>
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

          {/* Contract Preview */}
          <ContractPreview
            ref={outputRef}
            content={displayContent}
            isGenerating={isGenerating}
            isDark={isDark}
          />
        </div>
      </main>
    </div>
  )
}

export default App