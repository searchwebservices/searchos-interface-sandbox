// Gilfoyle's markdown reply. Prose goes through AI Elements MessageResponse (Streamdown); fenced blocks are
// split out first so the shell rule from console/ui/markdown.js can give every command its own Copy.
import { memo, useMemo } from 'react'
import { bundledLanguages } from 'shiki'
import type { BundledLanguage } from 'shiki'
import { MessageResponse } from '@/components/ai-elements/message'
import { CodeBlock, CodeBlockActions, CodeBlockHeader, CodeBlockTitle } from '@/components/ai-elements/code-block'
import { commandsOf, splitFences } from '@/lib/markdown'
import { CopyButton } from './CopyButton'

export function CommandBlock({ lang, code }: { lang: string; code: string }) {
  const parts = useMemo(() => commandsOf(code), [code])
  return (
    <div className="w-full overflow-hidden rounded-md border bg-card text-sm" data-lang={lang || 'sh'} data-testid="command-block">
      {parts.map((p, i) =>
        p.kind === 'cmd' ? (
          <div key={i} className="flex items-start justify-between gap-2 border-b px-3 py-1.5 last:border-b-0">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[0.8125rem]">{p.text}</code>
            <CopyButton text={p.text} />
          </div>
        ) : (
          <div key={i} className="whitespace-pre-wrap break-all px-3 py-1 font-mono text-[0.8125rem] text-muted-foreground">
            {p.text}
          </div>
        ),
      )}
    </div>
  )
}

function PlainCode({ lang, code }: { lang: string; code: string }) {
  const language = (lang && lang.toLowerCase() in bundledLanguages ? lang.toLowerCase() : 'text') as BundledLanguage
  return (
    <CodeBlock code={code} language={language}>
      <CodeBlockHeader>
        <CodeBlockTitle>{lang || 'text'}</CodeBlockTitle>
        <CodeBlockActions>
          <CopyButton text={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  )
}

export const Reply = memo(function Reply({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const segments = useMemo(() => splitFences(text), [text])
  return (
    <div data-find className="flex w-full flex-col gap-3 text-[0.9375rem] leading-relaxed">
      {segments.map((s, i) =>
        s.type === 'md' ? (
          <MessageResponse key={i} isAnimating={streaming && i === segments.length - 1}>
            {s.text}
          </MessageResponse>
        ) : s.shell ? (
          <CommandBlock key={i} lang={s.lang} code={s.code} />
        ) : (
          <PlainCode key={i} lang={s.lang} code={s.code} />
        ),
      )}
    </div>
  )
})
