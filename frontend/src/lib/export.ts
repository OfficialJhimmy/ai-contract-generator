import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx"
import { saveAs } from "file-saver"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

/**
 * Export contract to Word (.docx)
 */
export async function exportToWord(htmlContent: string, filename: string = "contract.docx") {
  try {
    // Parse HTML to extract text content with basic formatting
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, "text/html")
    
    const paragraphs: any[] = []
    
    // Add title
    paragraphs.push(
      new Paragraph({
        text: "Legal Contract",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      })
    )
    
    // Process document elements
    const processElement = (element: Element, level: number = 0) => {
      const tagName = element.tagName?.toLowerCase()
      const text = element.textContent?.trim() || ""
      
      if (!text) return
      
      if (tagName === "h1") {
        paragraphs.push(
          new Paragraph({
            text: text,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          })
        )
      } else if (tagName === "h2") {
        paragraphs.push(
          new Paragraph({
            text: text,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 }
          })
        )
      } else if (tagName === "h3") {
        paragraphs.push(
          new Paragraph({
            text: text,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
          })
        )
      } else if (tagName === "p") {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(text)],
            spacing: { after: 120 }
          })
        )
      } else if (tagName === "li") {
        paragraphs.push(
          new Paragraph({
            text: text,
            bullet: { level: level },
            spacing: { after: 100 }
          })
        )
      } else if (element.children.length > 0) {
        // Process children
        Array.from(element.children).forEach(child => {
          processElement(child, level)
        })
      }
    }
    
    // Process body content
    Array.from(doc.body.children).forEach(element => {
      processElement(element)
    })
    
    // Create document
    const docxDocument = new Document({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    })
    
    // Generate and save
    const blob = await Packer.toBlob(docxDocument)
    saveAs(blob, filename)
    
    return true
  } catch (error) {
    console.error("Error exporting to Word:", error)
    throw new Error("Failed to export to Word document")
  }
}

/**
 * Export contract to PDF
 */
export async function exportToPDF(htmlContent: string, filename: string = "contract.pdf") {
  try {
    // Create a temporary container
    const container = document.createElement("div")
    container.style.position = "absolute"
    container.style.left = "-9999px"
    container.style.width = "210mm" // A4 width
    container.style.padding = "20mm"
    container.style.backgroundColor = "white"
    container.style.fontFamily = "Georgia, serif"
    container.innerHTML = htmlContent
    document.body.appendChild(container)
    
    // Generate canvas from HTML
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff"
    })
    
    // Remove temporary container
    document.body.removeChild(container)
    
    // Create PDF
    const imgWidth = 210 // A4 width in mm
    const pageHeight = 297 // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    
    const pdf = new jsPDF("p", "mm", "a4")
    let position = 0
    
    // Add image to PDF (handle multiple pages)
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    
    // Save PDF
    pdf.save(filename)
    
    return true
  } catch (error) {
    console.error("Error exporting to PDF:", error)
    throw new Error("Failed to export to PDF document")
  }
}