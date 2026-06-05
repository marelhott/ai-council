import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

export interface ComposerAttachment {
  file: File
  extractedText?: string
}

export const TEXT_ATTACHMENT_ACCEPT = '.txt,.md,.csv,.json,.html,text/plain,text/markdown,text/csv,application/json,text/html'

const TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'text/html',
]

export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    inputRef.current?.click()
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    const readableFiles = files.filter(file =>
      TEXT_TYPES.includes(file.type) || /\.(txt|md|json|csv|html)$/i.test(file.name),
    )

    const next = await Promise.all(readableFiles.map(async file => {
      const canRead = TEXT_TYPES.includes(file.type) || /\.(txt|md|json|csv|html)$/i.test(file.name)
      const extractedText = canRead ? await file.text().catch(() => '') : undefined
      return { file, extractedText }
    }))

    setAttachments(previous => [...previous, ...next])
    event.target.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments(previous => previous.filter((_, currentIndex) => currentIndex !== index))
  }

  function clearAttachments() {
    setAttachments([])
  }

  function appendAttachmentContext(prompt: string) {
    if (!attachments.length) return prompt

    const summary = attachments.map(attachment => {
      if (attachment.extractedText?.trim()) {
        return `Soubor: ${attachment.file.name}\nObsah:\n${attachment.extractedText.slice(0, 6000)}`
      }
      return `Soubor: ${attachment.file.name} (${attachment.file.type || 'neznámý typ'})`
    }).join('\n\n')

    return `${prompt}\n\n[Přiložené soubory]\n${summary}`
  }

  return {
    attachments,
    inputRef,
    openPicker,
    onFileChange,
    removeAttachment,
    clearAttachments,
    appendAttachmentContext,
  }
}
