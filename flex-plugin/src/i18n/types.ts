/** The plugin's user-facing strings. Every locale implements this shape, so
 *  adding a language is a single new file that the compiler checks for gaps. */
export interface Strings {
  // panel chrome
  panelTitle: string;
  noIdentifier: string;
  refresh: string;
  ambiguousProfiles: (count: number) => string;

  // load / error / partial states
  loading: string;
  loadingFor: (identifier: string) => string;
  errorTitle: (identifier: string) => string;
  partial: string;

  // tabs
  tabsAriaLabel: string;
  tabTraits: string;
  tabObservations: string;
  tabSummaries: string;
  tabSearch: string;
  tabCommunications: string;
  loadMore: string;

  // empty states
  noTraits: string;
  noObservations: string;
  noSummaries: string;
  noCommunications: string;

  // search + summarize
  searchAriaLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  sectionCustomer: string;
  sectionKnowledge: string;
  noMatchingMemory: string;
  noMatchingKnowledge: string;
  searchIdle: string;
  searching: string;
  summarize: string;
  summarizing: string;
  summarizingSpinner: string;
  assistantSummary: string;
  summaryDisclaimer: string;
  percentMatch: (pct: number) => string;

  // error messages (B3 friendlyError)
  errSessionExpired: string;
  errForbidden: string;
  errUnavailable: string;
}
