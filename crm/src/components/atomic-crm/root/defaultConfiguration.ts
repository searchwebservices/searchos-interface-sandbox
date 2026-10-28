import type { ConfigurationContextValue } from "./ConfigurationContext";
// Import the logos as module assets so Vite resolves their URL relative to the
// JS chunk (import.meta.url), not the current route. A plain "./logos/..." path
// breaks on nested routes like /oauth/consent and under a deployment sub-path.
import darkModeLogo from "./logos/svt-lockup-dark.svg";
import lightModeLogo from "./logos/svt-lockup-light.svg";

export const defaultDarkModeLogo = darkModeLogo;
export const defaultLightModeLogo = lightModeLogo;

export const defaultCurrency = "MXN";

export const defaultTitle = "SearchOS CRM";

export const defaultCompanySectors = [
  { value: "communication-services", label: "Communication Services" },
  { value: "consumer-discretionary", label: "Consumer Discretionary" },
  { value: "consumer-staples", label: "Consumer Staples" },
  { value: "energy", label: "Energy" },
  { value: "financials", label: "Financials" },
  { value: "health-care", label: "Health Care" },
  { value: "industrials", label: "Industrials" },
  { value: "information-technology", label: "Information Technology" },
  { value: "materials", label: "Materials" },
  { value: "real-estate", label: "Real Estate" },
  { value: "utilities", label: "Utilities" },
];

// SearchOS pipeline (Bay, 2026-10-28): seven stages. Old values are migrated by
// supabase/searchos/stages-2026-10-28.sql.
export const defaultDealStages = [
  { value: "discovery", label: "Discovery" },
  { value: "planning", label: "Planning" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "ghosted", label: "Ghosted" },
];

export const defaultDealPipelineStatuses = ["won", "lost", "ghosted"];

export const defaultDealCategories = [
  { value: "website", label: "Website" },
  { value: "software", label: "Software" },
  { value: "agent", label: "Agent" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "Cold", color: "var(--note-cold)" },
  { value: "warm", label: "Warm", color: "var(--note-warm)" },
  { value: "hot", label: "Hot", color: "var(--note-hot)" },
  {
    value: "in-contract",
    label: "In Contract",
    color: "var(--note-in-contract)",
  },
];

export const defaultTaskTypes = [
  { value: "none", label: "None" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Demo" },
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "follow-up", label: "Follow-up" },
  { value: "thank-you", label: "Thank you" },
  { value: "ship", label: "Ship" },
  { value: "call", label: "Call" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  currency: defaultCurrency,
  dealCategories: defaultDealCategories,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealStages: defaultDealStages,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
