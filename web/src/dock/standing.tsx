import type { ComponentType } from 'react'
import type { StandingId } from '@/lib/dock'
import { ApprovalQueue } from './ApprovalQueue'
import { InterfaceHealth } from './InterfaceHealth'
import { LaneFiles } from './LaneFiles'
import { Scratchpad } from './Scratchpad'
import { NetworkCanvas } from './NetworkCanvas'

export const STANDING_VIEW: Record<StandingId, ComponentType<{ lane: string }>> = {
  topology: NetworkCanvas,
  iface: InterfaceHealth,
  files: LaneFiles,
  approvals: ApprovalQueue,
  scratch: Scratchpad,
}
