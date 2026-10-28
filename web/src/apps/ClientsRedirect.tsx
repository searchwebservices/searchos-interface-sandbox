// The Clients app now lives in the CRM (Company page, SearchOS tab). The old addresses stay alive as redirects, so the
// Money Customers tab, bookmarks and Gilfoyle's links keep working:
//   #/apps/clients      -> #/apps/crm/companies
//   #/apps/clients/:id  -> #/apps/crm/companies/<company_id>/show/searchos (company looked up through /api/apps/clients/:id/crm)
// The redirect replaces the history entry so Back does not bounce through it.
import { useEffect, useState } from 'react'
import { call } from '@/lib/api'
import { AppPage } from './AppPage'
import { EmptyState } from './useAppApi'

export const CRM_COMPANIES = '#/apps/crm/companies'
const replaceHash = (h: string) => { try { window.location.replace(h) } catch { window.location.hash = h } }

export function ClientsListRedirect() {
  useEffect(() => { replaceHash(CRM_COMPANIES) }, [])
  return null
}

export function ClientRedirect({ id }: { id: string }) {
  const [miss, setMiss] = useState<'none' | 'unavailable' | null>(null)
  useEffect(() => {
    let live = true
    void call<{ company_id?: string }>('/api/apps/clients/' + encodeURIComponent(id) + '/crm').then((r) => {
      if (!live) return
      if (r.ok && r.body?.company_id) replaceHash(CRM_COMPANIES + '/' + encodeURIComponent(String(r.body.company_id)) + '/show/searchos')
      else setMiss(r.status === 404 ? 'none' : 'unavailable')
    })
    return () => { live = false }
  }, [id])
  return (
    <AppPage testid="apps-client-redirect" crumbs={[{ label: 'Apps' }, { label: 'CRM' }]} title="Client" context="Client redirect">
      {miss === 'none' ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground" data-testid="client-not-in-crm">
          <p>This client is not in the CRM yet.</p>
          <a href={CRM_COMPANIES} className="text-primary hover:underline">Open CRM companies</a>
        </div>
      ) : miss === 'unavailable' ? <EmptyState state={{ kind: 'unavailable' }} /> : <EmptyState state={{ kind: 'loading' }} />}
    </AppPage>
  )
}
