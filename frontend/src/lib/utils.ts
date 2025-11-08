import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

export function formatPageCount(wordCount: number): number {
  // Rough estimate: 250 words per page
  return Math.ceil(wordCount / 250)
}

export function stripHtmlTags(html: string): string {
  const tmp = document.createElement("div")
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ""
}

/**
 * Strip <style> tags from HTML content
 * This prevents inline styles from overriding our CSS
 */
export function stripStyleTags(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
}

/**
 * Clean HTML by removing unwanted tags and attributes
 */
export function cleanContractHtml(html: string): string {
  let cleaned = html
  
  // Remove <style> tags
  cleaned = stripStyleTags(cleaned)
  
  // Remove inline style attributes (optional - if you want to be thorough)
  // cleaned = cleaned.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '')
  
  // Remove <!DOCTYPE>, <html>, <head>, <body> tags if present
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '')
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, '')
  cleaned = cleaned.replace(/<\/?head[^>]*>/gi, '')
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, '')
  
  return cleaned.trim()
}