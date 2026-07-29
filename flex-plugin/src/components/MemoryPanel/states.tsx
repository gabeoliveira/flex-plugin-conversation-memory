import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Spinner } from '@twilio-paste/core/spinner';
import { Alert } from '@twilio-paste/core/alert';
import { Button } from '@twilio-paste/core/button';

import { getStrings } from '../../i18n';

/** Inline loading row shown while memory is being fetched. */
export function LoadingState({ identifier }: { identifier: string }) {
  const s = getStrings();
  return (
    <Box padding="space60" display="flex" alignItems="center" columnGap="space40">
      <Spinner decorative={false} title={s.loading} />
      <Text as="span">{s.loadingFor(identifier)}</Text>
    </Box>
  );
}

/** Neutral empty state — no identifier, no profile, or an empty tab. */
export function EmptyState({ message }: { message: string }) {
  return (
    <Box padding="space60">
      <Paragraph marginBottom="space0">{message}</Paragraph>
    </Box>
  );
}

/** Error state with the underlying message. */
export function ErrorState({ identifier, message }: { identifier: string; message: string }) {
  const s = getStrings();
  return (
    <Box padding="space60">
      <Alert variant="error">
        <Text as="span">
          <strong>{s.errorTitle(identifier)}</strong> {message}
        </Text>
      </Alert>
    </Box>
  );
}

/** Centered "Load more" action (C2), shown under a capped list. */
export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  const s = getStrings();
  return (
    <Box marginTop="space50" display="flex" justifyContent="center">
      <Button variant="link" onClick={onClick} loading={loading}>
        {s.loadMore}
      </Button>
    </Box>
  );
}

/** Soft warning banner shown when one upstream call failed but others worked. */
export function PartialBanner() {
  const s = getStrings();
  return (
    <Box marginBottom="space50">
      <Alert variant="warning">
        <Text as="span">{s.partial}</Text>
      </Alert>
    </Box>
  );
}
