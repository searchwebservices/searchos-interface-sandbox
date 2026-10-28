// Starts a throwaway console for the golden screenshots: the real server.js on 127.0.0.1 with a scratch data dir,
// fixture people and lanes, the OpenCode mock from console/test and CONSOLE_DEV=1 (which mints a device cookie with
// ?dev_as=marvin). Nothing here touches real data, real OpenCode or any credential. It serves web/dist, so build first.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const port = Number(process.env.GOLDEN_PORT || 18971)
const mockPort = port + 1
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-golden-'))
const data = path.join(tmp, 'data')
fs.mkdirSync(path.join(data, 'threads'), { recursive: true })
fs.mkdirSync(path.join(tmp, 'repo', 'sessions', 'state', 'inbox'), { recursive: true })
const w = (f, v) => fs.writeFileSync(path.join(data, f), JSON.stringify(v))
w('people.json', [
  { id: 'marvin', name: 'Marvin Kucera', role: 'owner', tailscale_logins: [], auth_user_id: null },
  { id: 'bay', name: 'Bay Purcell', role: 'admin', tailscale_logins: [], auth_user_id: null },
])
w('lanes.json', [
  { id: 'dm-marvin', kind: 'dm', title: 'Marvin', members: ['marvin'] },
  { id: 'dm-bay', kind: 'dm', title: 'Bay', members: ['bay'] },
  { id: 'hardware', kind: 'group', title: 'Hardware', members: ['marvin', 'bay'] },
  { id: 'standards', kind: 'group', title: 'Standards', members: ['marvin', 'bay'] },
  { id: 'lab', kind: 'group', title: 'Lab', members: ['marvin', 'bay'] },
])
w('devices.json', [])
const sessions = path.join(tmp, 'sessions.json')
fs.writeFileSync(sessions, JSON.stringify({ hardware: 'ses_hw', 'dm-marvin': 'ses_dm' }))
fs.writeFileSync(path.join(tmp, 'arp'), 'IP address       HW type     Flags       HW address            Mask     Device\n')

const kids = []
const run = (file, args, env = {}) => {
  const p = spawn(process.execPath, [file, ...args], { env: { ...process.env, ...env }, stdio: 'inherit' })
  kids.push(p)
  return p
}
const stop = () => { for (const k of kids) k.kill(); fs.rmSync(tmp, { recursive: true, force: true }) }
process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
process.on('exit', stop)

run(path.join(root, 'console/test/mock-opencode.js'), [String(mockPort), path.join(tmp, 'oc.log'), path.join(tmp, 'oc-actions.log')])
run(path.join(root, 'console/server.js'), [], {
  CONSOLE_INTERNAL_PORT: 'off',
  CONSOLE_BIND: '127.0.0.1',
  CONSOLE_PORT: String(port),
  CONSOLE_DATA_DIR: data,
  CONSOLE_DEV: '1',
  SESSIONS_FILE: sessions,
  ARP_FILE: path.join(tmp, 'arp'),
  LANWATCH_DB: path.join(tmp, 'lw.db'),
  REPO_ROOT: path.join(tmp, 'repo'),
  OPENCODE_URL: 'http://127.0.0.1:' + mockPort,
  OPENCODE_PASSWORD: 'golden-not-a-secret',
  SOVEREIGN_SUPABASE_URL: 'http://127.0.0.1:9',
  SOVEREIGN_SUPABASE_SERVICE_KEY: 'golden-not-a-secret',
})
