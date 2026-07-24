import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Card } from '@twilio-paste/core/card';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';

import { EmptyState } from './states';
import { formatTimestamp, formatConversationIds } from '../../utils/format';
import type { MemorySummary } from '../../api/fetchMemory';

interface Props {
  summaries: MemorySummary[];
}

/** Conversation summaries as a list of cards, newest first. */
export function SummariesTab({ summaries }: Props) {
  if (summaries.length === 0) {
    return <EmptyState message="No summaries recorded for this customer." />;
  }

  const sorted = [...summaries].sort((a, b) => timeOf(b) - timeOf(a));

  return (
    <Box paddingTop="space50">
      <Stack orientation="vertical" spacing="space50">
        {sorted.map((s) => {
          const when = formatTimestamp(s.createdAt);
          const convos = formatConversationIds(s.conversationIds);
          return (
            <Card key={s.id} padding="space60">
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                columnGap="space40"
                marginBottom="space30"
              >
                {s.source ? (
                  <Badge as="span" variant="decorative10">
                    {s.source}
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
              <Paragraph marginBottom="space0">{s.content}</Paragraph>
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

function timeOf(s: MemorySummary): number {
  const t = new Date(s.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}
