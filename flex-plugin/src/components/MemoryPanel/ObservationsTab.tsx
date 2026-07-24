import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Card } from '@twilio-paste/core/card';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';

import { EmptyState } from './states';
import { formatTimestamp, formatConversationIds } from '../../utils/format';
import type { MemoryObservation } from '../../api/fetchMemory';

interface Props {
  observations: MemoryObservation[];
}

/** Observations as a list of cards, newest first, with source + timestamp. */
export function ObservationsTab({ observations }: Props) {
  if (observations.length === 0) {
    return <EmptyState message="No observations recorded for this customer." />;
  }

  const sorted = [...observations].sort(
    (a, b) => timeOf(b) - timeOf(a),
  );

  return (
    <Box paddingTop="space50">
      <Stack orientation="vertical" spacing="space50">
        {sorted.map((o) => {
          const when = formatTimestamp(o.occurredAt ?? o.createdAt);
          const convos = formatConversationIds(o.conversationIds);
          return (
            <Card key={o.id} padding="space60">
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                columnGap="space40"
                marginBottom="space30"
              >
                {o.source ? (
                  <Badge as="span" variant="decorative10">
                    {o.source}
                  </Badge>
                ) : (
                  <span />
                )}
                {when ? (
                  <Text as="span" fontSize="fontSize20" color="colorTextWeak">
                    {when}
                  </Text>
                ) : null}
              </Box>
              <Paragraph marginBottom="space0">{o.content}</Paragraph>
              {convos ? (
                <Text as="div" fontSize="fontSize10" color="colorTextWeak" marginTop="space20">
                  {convos}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

function timeOf(o: MemoryObservation): number {
  const t = new Date(o.occurredAt ?? o.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}
