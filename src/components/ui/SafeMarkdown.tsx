import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

export default function SafeMarkdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`prose ${className}`.trim()}>
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
