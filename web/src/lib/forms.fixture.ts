import type { FormDef } from './types'

// The same form console/test/smoke.sh uses.
export const FORM: FormDef = {
  id: 'frm_1',
  title: 'Welcome John',
  metadata: { intro: 'Quick.', pages: [{ heading: 'You', keys: ['role_title', 'uses_crestron'] }, { heading: 'Skills', keys: ['years'] }] },
  fields: [
    { key: 'role_title', type: 'string', title: 'Role?', required: true },
    { key: 'uses_crestron', type: 'boolean', title: 'Crestron?' },
    { key: 'years', type: 'integer', title: 'Years?', required: true, when: [{ key: 'uses_crestron', op: 'eq', value: true }] },
  ],
}
