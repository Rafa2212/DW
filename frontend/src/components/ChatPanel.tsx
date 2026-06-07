import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Loader2, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What assets are in the warehouse?',
  'Forecast BTCUSD price for the next 7 days',
  'What is the risk profile of QDL/BITFINEX/BTCUSD?',
  'Compare BTCUSD and ETHUSD over the last year',
  'Show me statistics for STOCKS/AAPL',
]

async function sendChat(messages: Message[]): Promise<string> {
  const res = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.reply
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-600' : 'bg-gray-700'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap'
          : 'bg-gray-800 text-gray-200 rounded-tl-sm'
      }`}>
        {isUser ? msg.content : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <p className="font-bold text-white text-base mb-1">{children}</p>,
              h2: ({ children }) => <p className="font-bold text-white text-sm mb-1 mt-2">{children}</p>,
              h3: ({ children }) => <p className="font-semibold text-blue-300 text-xs uppercase tracking-wider mb-1 mt-2">{children}</p>,
              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              strong: ({ children }) => <span className="font-semibold text-white">{children}</span>,
              em: ({ children }) => <span className="italic text-gray-300">{children}</span>,
              code: ({ children }) => <code className="bg-gray-700 text-blue-300 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
              hr: () => <hr className="border-gray-700 my-2" />,
              ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5 ml-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5 ml-1">{children}</ol>,
              li: ({ children }) => <li className="text-gray-200">{children}</li>,
              table: ({ children }) => (
                <div className="overflow-x-auto my-2 rounded-lg border border-gray-700/60">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-gray-700/70">{children}</thead>,
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children, ...props }) => (
                <tr className="even:bg-gray-700/20 hover:bg-gray-700/40 transition-colors" {...props}>{children}</tr>
              ),
              th: ({ children }) => <th className="px-3 py-2 text-left text-gray-300 font-semibold border-b border-gray-600 whitespace-nowrap">{children}</th>,
              td: ({ children }) => <td className="px-3 py-1.5 text-gray-200 border-b border-gray-700/30">{children}</td>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const reply = await sendChat(newMessages)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg shadow-blue-900/40 flex items-center justify-center transition-all duration-200 hover:scale-105"
        style={{ width: 52, height: 52 }}
        title="AI Assistant"
      >
        {open ? <ChevronDown className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {!open && messages.filter(m => m.role === 'assistant').length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[9px] flex items-center justify-center font-bold">
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          style={{ height: 580 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">FinDW Assistant</p>
                <p className="text-xs text-gray-500">Powered by Claude · live warehouse data</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-center text-sm text-gray-500 mt-4">
                  Ask me anything about your financial data.
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs text-gray-400 hover:text-gray-200 bg-gray-800/60 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors border border-gray-700/50 hover:border-gray-600"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="bg-gray-800 px-3.5 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  <span className="text-xs text-gray-400">Fetching data…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-800">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError('') }}
                className="text-xs text-gray-600 hover:text-gray-400 mb-2 transition-colors"
              >
                Clear conversation
              </button>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                className="flex-1 bg-gray-800 border border-gray-700 focus:border-blue-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none resize-none transition-colors"
                placeholder="Ask about assets, forecasts, risk…"
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                style={{ maxHeight: 120 }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
                disabled={loading}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="shrink-0 w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl flex items-center justify-center transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  )
}
