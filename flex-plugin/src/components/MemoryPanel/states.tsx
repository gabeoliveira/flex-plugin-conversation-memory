import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Spinner } from '@twilio-paste/core/spinner';
import { Alert } from '@twilio-paste/core/alert';

/** Inline loading row shown while memory is being fetched. */
export function LoadingState({ identifier }: { identifier: string }) {
  return (
    <Box padding="space60" display="flex" alignItems="center" columnGap="space40">
      <Spinner decorative={false} title="Loading customer memory" />
      <Text as="span">Loading customer memory for {identifier}…</Text>
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
  return (
    <Box padding="space60">
      <Alert variant="error">
        <Text as="span">
          <strong>Failed to load customer memory for {identifier}.</strong> {message}
        </Text>
      </Alert>
    </Box>
  );
}

/** Soft warning banner shown when one upstream call failed but others worked. */
export function PartialBanner() {
  return (
    <Box marginBottom="space50">
      <Alert variant="warning">
        <Text as="span">Some memory data could not be loaded. Showing what is available.</Text>
      </Alert>
    </Box>
  );
}
