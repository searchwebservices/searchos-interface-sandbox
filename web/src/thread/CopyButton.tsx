import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clip'

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  const t = useRef(0)
  useEffect(() => () => window.clearTimeout(t.current), [])
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={className}
      aria-label={label}
      onClick={async () => {
        setState((await copyText(text)) ? 'done' : 'fail')
        window.clearTimeout(t.current)
        t.current = window.setTimeout(() => setState('idle'), 1500)
      }}
    >
      {state === 'done' ? <CheckIcon /> : <CopyIcon />}
      {state === 'done' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}
    </Button>
  )
}
