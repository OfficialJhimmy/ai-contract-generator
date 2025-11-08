import React, { forwardRef } from "react"
import { cn } from "../lib/utils"

interface ContractPreviewProps {
  content: string
  isGenerating: boolean
  isDark: boolean
}

export const ContractPreview = forwardRef<HTMLDivElement, ContractPreviewProps>(
  ({ content, isGenerating, isDark }, ref) => {
    return (
      <div
        className={cn(
          "rounded-xl border overflow-hidden",
          isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
        )}
      >
        <div className={cn(
          "px-4 py-3 border-b flex items-center justify-between",
          isDark ? "border-gray-800" : "border-gray-200"
        )}>
          <h3 className={cn(
            "font-semibold",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Contract Preview
          </h3>
          
          {isGenerating && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  isDark ? "bg-blue-500" : "bg-blue-600"
                )} style={{ animationDelay: "0ms" }} />
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  isDark ? "bg-blue-500" : "bg-blue-600"
                )} style={{ animationDelay: "150ms" }} />
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  isDark ? "bg-blue-500" : "bg-blue-600"
                )} style={{ animationDelay: "300ms" }} />
              </div>
              <span className={cn(
                "text-sm",
                isDark ? "text-gray-400" : "text-gray-600"
              )}>
                Generating...
              </span>
            </div>
          )}
        </div>
        
        <div
          ref={ref}
          className="p-6 overflow-y-auto"
          style={{ maxHeight: "60vh" }}
        >
          {!content && isGenerating ? (
            <div className="space-y-3 animate-pulse">
              <div className={cn(
                "h-4 rounded",
                isDark ? "bg-gray-800" : "bg-gray-200"
              )} style={{ width: "80%" }} />
              <div className={cn(
                "h-4 rounded",
                isDark ? "bg-gray-800" : "bg-gray-200"
              )} style={{ width: "60%" }} />
              <div className={cn(
                "h-4 rounded",
                isDark ? "bg-gray-800" : "bg-gray-200"
              )} style={{ width: "90%" }} />
              <div className={cn(
                "h-4 rounded",
                isDark ? "bg-gray-800" : "bg-gray-200"
              )} style={{ width: "70%" }} />
            </div>
          ) : content ? (
            <div 
              className={cn(
                "prose prose-sm max-w-none contract-content",
                isDark && "prose-invert"
              )}
              dangerouslySetInnerHTML={{ __html: content }} 
            />
          ) : null}
          
          {isGenerating && content && (
            <span className="inline-block ml-1 w-2 h-5 bg-blue-500 animate-pulse" />
          )}
        </div>
      </div>
    )
  }
)

ContractPreview.displayName = "ContractPreview"