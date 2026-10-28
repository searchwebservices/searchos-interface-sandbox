// Static per-lane empty state: the lane's purpose in one line (from sessions/lanes/<lane>.md, "What this
// lane is for") and three suggestion cards. docs/console-v2-spec.md section 1. "Gilfoyle, how can I help?"
// is wrong for Gilfoyle, so there is none of that.

export interface LaneEmpty {
  purpose: string
  suggestions: string[]
}

export const LANE_EMPTY: Record<string, LaneEmpty> = {
  hardware: {
    purpose: 'The rack, the Lenovo box, the LAN, lan-watch, cabling, power, backups and Tailscale.',
    suggestions: ['What changed on the LAN since yesterday', 'Link speed on the rack uplink', 'Backups: when was the last restore test'],
  },
  'dm-marvin': {
    purpose: "Marvin's direct line to Gilfoyle: hardware, network, data and device approvals.",
    suggestions: ['Who is 10.100.100.x', 'Review this config', 'Approve pending devices'],
  },
  standards: {
    purpose: 'Documenting and enforcing best practices and standards, one file per standard.',
    suggestions: ['Write a standard for X', 'What standards exist'],
  },
  lab: {
    purpose: 'Skills, learning, training Gilfoyle, new projects and brainstorming.',
    suggestions: ['Try a skill', 'Train on this document', 'Explain how you are built'],
  },
  'dm-bay': {
    purpose: "Bay's direct line to Gilfoyle: build and admin of the harness.",
    suggestions: ['Harness status', 'What is waiting on me', 'Cost this week'],
  },
}

LANE_EMPTY['gilfoyle-desk'] = {
  purpose: "Where Jared's asks to Gilfoyle land, and Gilfoyle's answers go back. Bay reads it; nobody types here.",
  suggestions: ['Which asks are still open', 'What did Jared ask this week', 'Answer the oldest ask'],
}
LANE_EMPTY['jared-desk'] = {
  purpose: "Where Gilfoyle's asks to Jared land, and Jared's answers go back. Bay reads it; nobody types here.",
  suggestions: ['Which asks are still open', 'What did Gilfoyle ask this week', 'Answer the oldest ask'],
}
LANE_EMPTY['jared-bay'] = {
  purpose: "Bay's direct line to Jared: the day, the pipeline, money and everything that needs a decision.",
  suggestions: ['What is on my plate today', 'What is waiting on me', 'Where do the clients stand'],
}
LANE_EMPTY['jared-dani'] = {
  purpose: "Dani's direct line to Jared: facturas, cobranza, brand and marketing, in Spanish.",
  suggestions: ['Qué facturas faltan', 'Armá un borrador de post', 'Cómo viene la cobranza'],
}
LANE_EMPTY['jared-borja'] = {
  purpose: "Borja's direct line to Jared: clients, proposals and follow-ups, in Spanish.",
  suggestions: ['Qué propuestas están abiertas', 'Redactame un mensaje para un cliente', 'Qué clientes quedaron sin respuesta'],
}
LANE_EMPTY['jared-ops'] = {
  purpose: 'Search ops: Bay, Dani and Borja with Jared in one thread. Everything said here is seen by all three.',
  suggestions: ['What changed this week', 'Who owns this next', 'Summarize the open items'],
}

// Bay's lanes on Jared (the lean OpenCode versions of his Claude Code lanes).
LANE_EMPTY['jared-command'] = {
  purpose: 'The default lane: the day, triage, planning and routing work to the right lane.',
  suggestions: ['What is on my plate today', 'What slipped this week', 'Where should this go'],
}
LANE_EMPTY['jared-money'] = {
  purpose: 'Money in and out: invoicing, cobranza, banking continuity and subscriptions.',
  suggestions: ['What is unpaid right now', 'Any failed webhooks', 'State of the card'],
}
LANE_EMPTY['jared-growth'] = {
  purpose: 'Everything upstream of a signed client: proposals, leads, partners and contracts.',
  suggestions: ['Open proposals awaiting a send', 'What is sitting at discovery', 'Draft a proposal outline'],
}
LANE_EMPTY['jared-clients'] = {
  purpose: 'Client delivery and deploys for accounts without a lane of their own.',
  suggestions: ['Open QA loops', 'What is pending us versus the client', 'Which deploys are waiting on my yes'],
}
LANE_EMPTY['jared-build'] = {
  purpose: "Search's own product surface: the site, the webapp, Atlas, TeamOS and the book.",
  suggestions: ['Unpushed branches', 'What is half-shipped', 'Next on the roadmap'],
}
LANE_EMPTY['jared-infra'] = {
  purpose: 'SearchOS itself: the box, the database, hooks, registry and the lane system.',
  suggestions: ['Box health', 'Open infra tickets', 'What did the timers do overnight'],
}
LANE_EMPTY['jared-arido'] = {
  purpose: 'Arido end to end: the live order system, POS sync and its tickets.',
  suggestions: ['Open Arido tickets', 'Anything mid-QA', 'Decisions waiting on me'],
}
LANE_EMPTY['jared-gs'] = {
  purpose: 'Golden Sands OS: the rebuild, the engagement with Sol and the program.',
  suggestions: ['Where the rebuild stands', 'What is waiting on Sol', 'Next in the backlog'],
}
LANE_EMPTY['jared-scott'] = {
  purpose: 'Scott end to end: the SEO retainer, the site, the domains and his OS.',
  suggestions: ['Retainer status', 'Domain renewals', 'What is open with Scott'],
}
LANE_EMPTY['jared-uniqueos'] = {
  purpose: "UniqueOS and Unique Cabo Weddings: the app, delivery and the couples' sites.",
  suggestions: ['Open couple sites', 'What is waiting on UCW', 'Single-writer status'],
}
LANE_EMPTY['jared-bpe'] = {
  purpose: 'BPE OS delivery until it runs on its own, with Mateo as its agent.',
  suggestions: ['Where BPE OS stands', 'Open blockers', 'Next workflow to ship'],
}
LANE_EMPTY['jared-site'] = {
  purpose: 'The new Search site, reviewed section by section with Bay.',
  suggestions: ['Next section to review', 'What is still template text', 'Last accepted section'],
}
LANE_EMPTY['jared-studio'] = {
  purpose: 'Search Studio: components, templates, the design system and SearchSpace.',
  suggestions: ['Open STU tickets', 'Registry status', 'Atlas generator status'],
}
LANE_EMPTY['jared-kimi-flex'] = {
  purpose: 'Experimental open lane, idle unless Bay opens it.',
  suggestions: ['What would you like to try', 'Scope a small task', 'Status of this lane'],
}
LANE_EMPTY['jared-command-glm'] = {
  purpose: 'Experimental fallback copy of the command lane, idle unless Bay opens it.',
  suggestions: ['What is on my plate today', 'Credit lock status', 'Which lanes are busy'],
}

export const FALLBACK_EMPTY: LaneEmpty = { purpose: 'A permanent thread with Gilfoyle.', suggestions: [] }
const fallbackFor = (agent: string): LaneEmpty => (agent === 'Gilfoyle' ? FALLBACK_EMPTY : { purpose: 'A permanent thread with ' + agent + '.', suggestions: [] })

export const emptyFor = (laneId: string, agent = 'Gilfoyle'): LaneEmpty => LANE_EMPTY[laneId] ?? fallbackFor(agent)
