import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Card } from '@twilio-paste/core/card';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';

import { EmptyState, LoadMoreButton } from './states';
import { getStrings } from '../../i18n';
import { formatTimestamp } from '../../utils/format';
import type { MemoryCommunication } from '../../api/fetchMemory';

interface Props {
  communications: MemoryCommunication[];
  /** Present when more can be loaded (C2). */
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

/**
 * Recent cross-channel messages (D4 — opt-in). Renders defensively since Recall's
 * communication fields vary. PII redaction is a Conversation Memory/CI concern; this tab only
 * shows what Recall returns, and is off by default (enableCommunications).
 */
export function CommunicationsTab({ communications, onLoadMore, loadingMore }: Props) {
  if (!communications || communications.length === 0) {
    return <EmptyState message={getStrings().noCommunications} />;
  }

  const sorted = [...communications].sort((a, b) => timeOf(b) - timeOf(a));

  return (
    <Box paddingTop="space50">
      <Stack orientation="vertical" spacing="space50">
        {sorted.map((c) => {
          const when = formatTimestamp(c.occurredAt ?? c.createdAt);
          const who = c.author || c.role;
          return (
            <Card key={c.id} padding="space60">
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                columnGap="space40"
                marginBottom="space30"
              >
                <Box display="flex" alignItems="center" columnGap="space20">
                  {c.channel ? (
                    <Badge as="span" variant="decorative10">
                      {c.channel}
                    </Badge>
                  ) : null}
                  {who ? (
                    <Text as="span" fontSize="fontSize20" fontWeight="fontWeightSemibold">
                      {who}
                    </Text>
                  ) : null}
                </Box>
                {when ? (
                  <Text as="span" fontSize="fontSize20" color="colorTextWeak">
                    {when}
                  </Text>
                ) : null}
              </Box>
              <Paragraph marginBottom="space0">{c.content}</Paragraph>
            </Card>
          );
        })}
      </Stack>
      {onLoadMore ? <LoadMoreButton onClick={onLoadMore} loading={loadingMore} /> : null}
    </Box>
  );
}

function timeOf(c: MemoryCommunication): number {
  const t = new Date(c.occurredAt ?? c.createdAt ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}
