import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Badge } from '@twilio-paste/core/badge';
import { Tabs, TabList, Tab, TabPanels, TabPanel, useTabState } from '@twilio-paste/core/tabs';

import { TraitsTab } from './TraitsTab';
import { ObservationsTab } from './ObservationsTab';
import { SummariesTab } from './SummariesTab';
import { SearchTab } from './SearchTab';
import { PartialBanner } from './states';
import { getStrings } from '../../i18n';
import type { MemoryResponse } from '../../api/fetchMemory';
import type { IdentifierCandidate } from '../../utils/identifiers';

interface Props {
  data: MemoryResponse;
  identifiers: IdentifierCandidate[];
  token: string;
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

export function MemoryTabs({ data, identifiers, token }: Props) {
  const s = getStrings();
  const tabState = useTabState({ baseId: 'memory-tabs', selectedId: 'traits' });

  const traitGroupCount = Object.keys(data.traits || {}).length;
  const observationCount = data.observations.length;
  const summaryCount = data.summaries.length;

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
          <Tab id="search">{s.tabSearch}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <TraitsTab traits={data.traits} />
          </TabPanel>
          <TabPanel>
            <ObservationsTab observations={data.observations} />
          </TabPanel>
          <TabPanel>
            <SummariesTab summaries={data.summaries} />
          </TabPanel>
          <TabPanel>
            <SearchTab identifiers={identifiers} profileId={data.profileId} token={token} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
