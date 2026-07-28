import type { Strings } from './types';

/** English (US) — the default/fallback locale. */
export const en: Strings = {
  panelTitle: 'Customer Memory',
  noIdentifier: 'No customer identifier on this task.',
  refresh: 'Refresh',
  ambiguousProfiles: (count) =>
    `${count} profiles match this identifier — showing the first. Confirm you have the right customer.`,

  loading: 'Loading customer memory',
  loadingFor: (identifier) => `Loading customer memory for ${identifier}…`,
  errorTitle: (identifier) => `Failed to load customer memory for ${identifier}.`,
  partial: 'Some memory data could not be loaded. Showing what is available.',

  tabsAriaLabel: 'Customer memory',
  tabTraits: 'Traits',
  tabObservations: 'Observations',
  tabSummaries: 'Summaries',
  tabSearch: 'Search',

  noTraits: 'No traits recorded for this customer.',
  noObservations: 'No observations recorded for this customer.',
  noSummaries: 'No summaries recorded for this customer.',

  searchAriaLabel: 'Search customer memory and knowledge base',
  searchPlaceholder: 'Search memory and knowledge…',
  searchButton: 'Search',
  sectionCustomer: 'This customer',
  sectionKnowledge: 'Knowledge base',
  noMatchingMemory: 'No matching memory for this customer.',
  noMatchingKnowledge: 'No matching knowledge.',
  searchIdle: "Search this customer's memory and your knowledge base.",
  searching: 'Searching…',
  summarize: 'Summarize results',
  summarizing: 'Summarizing…',
  summarizingSpinner: 'Summarizing the results…',
  assistantSummary: 'Assistant summary',
  summaryDisclaimer: 'AI-generated from the results below ([M#]/[K#]) — verify against the sources.',
  percentMatch: (pct) => `${pct}% match`,

  errSessionExpired: 'Your Flex session expired. Reload Flex and try again.',
  errForbidden: 'You do not have permission to view customer memory.',
  errUnavailable: 'The memory service is unavailable right now. Try again in a moment.',
};
