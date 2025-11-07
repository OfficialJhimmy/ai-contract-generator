import { useState, useEffect } from "react"
import { Loader2, FileDown, AlertCircle, CheckCircle2, Zap } from "lucide-react"
import { useWebSocket } from "./hooks/useWebSocket"
import { exportToWord, exportToPDF } from "./lib/export"
import { formatWordCount, formatPageCount, stripHtmlTags, cn } from "./lib/utils"

// Replace with your actual WebSocket URL from deployment
const WS_URL = import.meta.env.VITE_WS_URL || "wss://YOUR-WEBSOCKET-ID.execute-api.us-east-1.amazonaws.com/prod"

const QUICK_PROMPTS = [
  "Draft an NDA between SaaS firms",
  "Consulting agreement (hourly)",
  "Mutual non-disparagement clause",
  "Termination & liability cap"
]

function App() {
  const [prompt, setPrompt] = useState("Draft Terms of Service for a cloud cyber SaaS company based in New York.")
  const [targetPages, setTargetPages] = useState(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState("")
  const [displayContent, setDisplayContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const { status, connect, disconnect, sendMessage, onMessage } = useWebSocket(WS_URL)
  
  // Connect to WebSocket on mount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])
  
  // Set up message handler
  useEffect(() => {
    onMessage((message) => {
      console.log("Received message:", message.type)
      
      if (message.type === "start") {
        setIsGenerating(true)
        setError(null)
        setSuccess(false)
        setGeneratedContent("")
        setDisplayContent("")
      } else if (message.type === "content") {
        setGeneratedContent(message.content || "")
        setDisplayContent(message.content || "")
        setIsGenerating(false)
        setSuccess(true)
      } else if (message.type === "complete") {
        setIsGenerating(false)
        setSuccess(true)
      } else if (message.type === "error") {
        setIsGenerating(false)
        setError(message.error || "An error occurred")
      }
    })
  }, [onMessage])
  
  const handleGenerate = () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt")
      return
    }
    
    if (status !== "connected") {
      setError("Not connected to server. Retrying...")
      connect()
      return
    }
    
    const sent = sendMessage({
      action: "generate",
      prompt: prompt.trim()
    })
    
    if (!sent) {
      setError("Failed to send request. Please try again.")
    }
  }
  
  const handleExport = async (format: "word" | "pdf") => {
    if (!generatedContent) return
    
    setIsExporting(true)
    try {
      const filename = `contract-${Date.now()}.${format === "word" ? "docx" : "pdf"}`
      
      if (format === "word") {
        await exportToWord(generatedContent, filename)
      } else {
        await exportToPDF(generatedContent, filename)
      }
    } catch (err) {
      setError(`Failed to export to ${format.toUpperCase()}`)
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }
  
  const wordCount = generatedContent ? formatWordCount(stripHtmlTags(generatedContent)) : 0
  const pageCount = formatPageCount(wordCount)
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="text-center mb-12">
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
        <div className="mb-8">
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
        {success && !isGenerating && (
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Word
              </button>
              <button
                onClick={() => handleExport("pdf")}
                disabled={isExporting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                PDF
              </button>
            </div>
          </div>
        )}
        
        {/* Generated Content Preview */}
        {displayContent && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Generated Contract</h2>
              <span className="text-sm text-gray-500">
                {wordCount.toLocaleString()} words • ~{pageCount} pages
              </span>
            </div>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          </div>
        )}
        
        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>WebSocket: {WS_URL.substring(0, 50)}...</p>
        </footer>
      </div>
    </div>
  )
}

export default App