import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Badge } from '@twilio-paste/core/badge';
import { Tabs, TabList, Tab, TabPanels, TabPanel, useTabState } from '@twilio-paste/core/tabs';

import { TraitsTab } from './TraitsTab';
import { ObservationsTab } from './ObservationsTab';
import { SummariesTab } from './SummariesTab';
import { CommunicationsTab } from './CommunicationsTab';
import { SearchTab } from './SearchTab';
import { PartialBanner } from './states';
import { getStrings } from '../../i18n';
import { communicationsEnabled } from '../../config';
import type { MemoryResponse } from '../../api/fetchMemory';
import type { IdentifierCandidate } from '../../utils/identifiers';

interface Props {
  data: MemoryResponse;
  identifiers: IdentifierCandidate[];
  token: string;
  /** Background "load more" is in flight (keeps the current data + tab visible). */
  loadingMore?: boolean;
  /** Present when more observations can be loaded; raises the Recall limit. */
  onLoadMoreObservations?: () => void;
  /** Present when more summaries can be loaded. */
  onLoadMoreSummaries?: () => void;
}

/** Small count chip rendered inside each tab label. */
function TabCount({ count }: { count: number }) {
  return (
    <Box as="span" marginLeft="space20">
      <Badge as="span" variant="neutral_counter">
        {count}
      </Badge>
    </Box>
  );
}

export function MemoryTabs({
  data,
  identifiers,
  token,
  loadingMore,
  onLoadMoreObservations,
  onLoadMoreSummaries,
}: Props) {
  const s = getStrings();
  const tabState = useTabState({ baseId: 'memory-tabs', selectedId: 'traits' });

  const traitGroupCount = Object.keys(data.traits || {}).length;
  const observationCount = data.observations.length;
  const summaryCount = data.summaries.length;
  const showComms = communicationsEnabled();
  const communications = data.communications || [];

  return (
    <Box>
      {data.partial ? <PartialBanner /> : null}
      <Tabs state={tabState}>
        <TabList aria-label={s.tabsAriaLabel}>
          <Tab id="traits">
            {s.tabTraits}
            <TabCount count={traitGroupCount} />
          </Tab>
          <Tab id="observations">
            {s.tabObservations}
            <TabCount count={observationCount} />
          </Tab>
          <Tab id="summaries">
            {s.tabSummaries}
            <TabCount count={summaryCount} />
          </Tab>
          {showComms ? (
            <Tab id="communications">
              {s.tabCommunications}
              <TabCount count={communications.length} />
            </Tab>
          ) : null}
          <Tab id="search">{s.tabSearch}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <TraitsTab traits={data.traits} />
          </TabPanel>
          <TabPanel>
            <ObservationsTab
              observations={data.observations}
              onLoadMore={onLoadMoreObservations}
              loadingMore={loadingMore}
            />
          </TabPanel>
          <TabPanel>
            <SummariesTab
              summaries={data.summaries}
              onLoadMore={onLoadMoreSummaries}
              loadingMore={loadingMore}
            />
          </TabPanel>
          {showComms ? (
            <TabPanel>
              <CommunicationsTab communications={communications} />
            </TabPanel>
          ) : null}
          <TabPanel>
            <SearchTab identifiers={identifiers} profileId={data.profileId} token={token} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
