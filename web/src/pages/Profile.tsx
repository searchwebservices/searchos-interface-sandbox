// /v2/#/profile: who you are in the chat (name, tag, picture) and how the interface looks for you. Prefs are saved per
// person and per device: "This device" keeps a choice on this browser only, "All my devices" sets the person default.
import { useEffect, useRef, useState } from 'react'
import { CameraIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PersonAvatar } from '@/components/PersonAvatar'
import { useApp } from '@/app/AppContext'
import { effectivePrefs, FONT_CHOICES, NAME_MAX, normTag, TAG_MESSAGES, validateProfile, ZOOM_CHOICES } from '@/lib/profile'
import type { ProfileErrors } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { displayName } from '@/lib/time'
import { PageHeader } from './Devices'
import { AVATAR_SOURCE_MAX, AVATAR_TYPES, AvatarCropper } from './AvatarCropper'

function Choice({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  return (
    <Button type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} data-testid={testid} onClick={onClick}>
      {children}
    </Button>
  )
}

export function ProfilePage() {
  const { store, saveProfile, uploadAvatar, removeAvatar, toast } = useApp()
  const me = store.me
  const mine = me ? store.profiles[me.person] : undefined
  const all = Object.values(store.profiles)
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [touched, setTouched] = useState(false)
  const [server, setServer] = useState<ProfileErrors>({})
  const [saving, setSaving] = useState(false)
  const clearServer = (k: keyof ProfileErrors) =>
    setServer((s) => {
      const n = { ...s }
      delete n[k]
      return n
    })
  const [scope, setScope] = useState<'device' | 'all'>('device')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Fill the form once the profile is known, and again when it changes elsewhere (another tab saved it).
  useEffect(() => {
    if (mine) {
      setName(mine.name)
      setTag(mine.tag)
      setServer({})
    }
  }, [mine?.name, mine?.tag]) // eslint-disable-line react-hooks/exhaustive-deps

  const errors: ProfileErrors = { ...(me ? validateProfile({ name, tag }, all, me.person) : {}), ...server }
  const dirty = !!mine && (name.replace(/\s+/g, ' ').trim() !== mine.name || normTag(tag) !== mine.tag)
  const eff = effectivePrefs(store.prefs, me?.device_id)
  const theme = eff.theme ?? 'system'
  const zoom = eff.zoom ?? 115
  const font = eff.font ?? 'montserrat'
  const calm = eff.reduced_motion ?? false

  const save = async () => {
    setTouched(true)
    if (errors.name || errors.tag || !me) return
    setSaving(true)
    const r = await saveProfile({ name: name.replace(/\s+/g, ' ').trim(), tag: normTag(tag) })
    setSaving(false)
    if (r.error) {
      setServer({ ...(r.fields?.name ? { name: r.fields.name } : {}), ...(r.fields?.tag ? { tag: TAG_MESSAGES[r.fields.tag] ?? r.fields.tag } : {}) })
      toast(r.error)
    } else {
      setServer({})
      toast('Profile saved')
    }
  }
  const setPref = async (values: Record<string, unknown>) => {
    const r = await saveProfile({ prefs: { scope, values } })
    if (r.error) toast(r.error)
  }
  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (!AVATAR_TYPES.includes(f.type)) return toast('Use a JPG or PNG picture.')
    if (f.size > AVATAR_SOURCE_MAX) return toast('That picture is too large.')
    setFile(f)
  }

  if (!me) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="profile-page">
      <PageHeader title="Your profile" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 p-4">
          <section aria-labelledby="who" className="flex flex-col gap-4">
            <h2 id="who" className="text-sm font-semibold">
              Who you are
            </h2>
            <div className="flex items-center gap-4">
              <PersonAvatar id={me.person} name={mine?.name} size="lg" />
              <div className="flex flex-col gap-2">
                <input ref={fileInput} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Picture file" data-testid="avatar-file" onChange={(e) => { pickFile(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  <CameraIcon />
                  Change picture
                </Button>
                {mine?.avatar && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void removeAvatar().then((e) => toast(e ?? 'Picture removed'))}>
                    <Trash2Icon />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-name">Full name</Label>
                <Input id="profile-name" value={name} maxLength={NAME_MAX + 20} aria-invalid={!!errors.name} aria-describedby="profile-name-err" onChange={(e) => { setName(e.currentTarget.value); setTouched(true); clearServer('name') }} />
                {errors.name && (touched || server.name) && <p id="profile-name-err" role="alert" className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-tag">Tag</Label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground" aria-hidden>@</span>
                  <Input id="profile-tag" value={tag} autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.tag} aria-describedby="profile-tag-err" onChange={(e) => { setTag(e.currentTarget.value); setTouched(true); clearServer('tag') }} />
                </div>
                <p className="text-xs text-muted-foreground">How people mention you: @{normTag(tag) || 'tag'}. Lowercase, 2 to 24 characters.</p>
                {errors.tag && (touched || server.tag) && <p id="profile-tag-err" role="alert" className="text-xs text-destructive">{errors.tag}</p>}
              </div>
              <div>
                <Button type="submit" disabled={!dirty || saving}>
                  Save
                </Button>
              </div>
            </form>
          </section>

          <section aria-labelledby="look" className="flex flex-col gap-4" data-testid="prefs">
            <h2 id="look" className="text-sm font-semibold">
              How it looks
            </h2>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Apply to">
              <span className="text-sm text-muted-foreground">Apply to</span>
              <Choice on={scope === 'device'} onClick={() => setScope('device')} testid="scope-device">This device ({me.device_name})</Choice>
              <Choice on={scope === 'all'} onClick={() => setScope('all')} testid="scope-all">All my devices</Choice>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Theme</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <Choice key={t} on={theme === t} onClick={() => void setPref({ theme: t })} testid={'theme-' + t}>
                    {displayName(t)}
                  </Choice>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Text size</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Text size">
                {ZOOM_CHOICES.map((z) => (
                  <Choice key={z} on={zoom === z} onClick={() => void setPref({ zoom: z })} testid={'zoom-' + z}>
                    {z}%
                  </Choice>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Font</Label>
              <div className="flex flex-col gap-2" role="group" aria-label="Font">
                {FONT_CHOICES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={font === f.id}
                    data-testid={'font-' + f.id}
                    onClick={() => void setPref({ font: f.id })}
                    className={cn('flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', font === f.id ? 'border-primary bg-accent' : 'hover:bg-accent/50')}
                  >
                    <span
                      className="text-base"
                      style={{ fontFamily: f.id === 'montserrat' ? 'Montserrat, sans-serif' : f.id === 'space-grotesk' ? "'Space Grotesk', sans-serif" : 'ui-sans-serif, system-ui, sans-serif' }}
                    >
                      {f.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{f.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="reduced-motion">Reduced motion</Label>
                <p className="text-xs text-muted-foreground">Stops animation and smooth scrolling.</p>
              </div>
              <Switch id="reduced-motion" checked={calm} onCheckedChange={(v) => void setPref({ reduced_motion: v })} />
            </div>
          </section>

          <section aria-labelledby="notes" className="flex flex-col gap-2">
            <h2 id="notes" className="text-sm font-semibold">
              Notifications
            </h2>
            <p className="text-sm text-muted-foreground">Coming later. Mentions already show on the lane row and in the tab title.</p>
          </section>
        </div>
      </div>
      <AvatarCropper
        file={file}
        onCancel={() => setFile(null)}
        onDone={(png) => {
          setFile(null)
          void uploadAvatar(png).then((e) => toast(e ?? 'Picture saved'))
        }}
      />
    </div>
  )
}
