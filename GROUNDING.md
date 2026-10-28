# How we use the CRM and the PM

Grounding for UI notes: how Search actually uses these tools day to day. Design for this, not for a generic sales team.

## CRM

The CRM is where a lead turns into a client. When Borja meets a florist at a networking lunch or someone messages us on WhatsApp asking about a website, they go in as a lead in Discovery and move across the board as we talk, send a proposal and close. Each company card keeps the people we deal with and, once they are a client, a SearchOS tab that shows how they are doing: health, monthly revenue, active projects, proposals and contracts. It is small on purpose. We have three recurring clients, not three hundred, so it works more like a shared memory of every conversation than a sales machine. The CRM answers "who are we talking to, and where does it stand?"

## PM

The PM answers "what has to get done, and who is on it?", and it works two ways. For Borja and Dani it is the ops side: the proposal due Thursday, the CFDI to stamp on the 3rd, the client follow-up that slipped, onboarding steps for a new account. Each item is short, has a date, and is ticked off on the day. For Bay it is the dev side: every client system we build, such as Unique OS, Scott OS, the Árido agent and SearchOS itself, is a project with its features, bugs and releases broken into items that cite where the request came from. Ops and dev share one workspace, so when Borja promises a client a change, the dev item sits next to his follow-up and both of them can see when it ships.

## The client profile (Bay, 2026-10-28)

In Bay's words: "when i open projects, and when anyone on the team opens a project, it should feel like a digital profile for that client. their whole digital footprint and activity with us. it should feel like a command console for everything surrounding that client. Each client has context, history, data, meeting records, lanes in our agent chats for that client, the engine lanes in our agent harness that help to power our work for that client, finances, projects and initiatives, products delivered and active, version history, and work done and pending for that client, items, scheduling, email threads with and about them, everything! It feels like a lot but its important that we maintain an interface that is pleasant to look at, easy to understand, and drills into whatever 'area' of that client you need at that moment intuitively."

So the client is the unit, not the project. A project is one area inside a client. Where each area really comes from today, so mockups use real shapes:

| Area | Source in SearchOS |
|------|--------------------|
| Context, people, health | CRM company card and contacts; the client board (health, whose ball it is) |
| History | CRM deal stages and notes; the change log of every record |
| Meeting records | Meet transcripts; calendar events |
| Agent chat lanes | Jared lanes per client (for example bay-arido), with their live state and events |
| Engine lanes | The client's own agent and automations (WhatsApp agent, n8n workflows), its turn log and AI usage per client |
| Finances | Monthly roster, CFDI facturas, cartera and payments, money transactions |
| Projects and initiatives, items, work done and pending | Search Projects (this PM): projects, work items with their sources, cycles; pending split into "on us" and "on the client" |
| Products delivered and active | Installed apps per client, their status page components and incidents |
| Version history | The client changelog (added, improved, fixed), app versions, the repos in the registry |
| Scheduling | Calendar events, cycles and due dates |
| Email and WhatsApp | Email threads with and about the client; the business WhatsApp line |
| Data | The client's own system data (orders, couples, listings), which stays theirs |

Three recurring clients, so the profile can afford depth over density. In the sandbox, mock all of this with fake data. Never point a mockup at production.
