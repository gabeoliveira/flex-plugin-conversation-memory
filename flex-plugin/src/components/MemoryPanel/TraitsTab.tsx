import React from 'react';

import { Box } from '@twilio-paste/core/box';
import { Card } from '@twilio-paste/core/card';
import { Heading } from '@twilio-paste/core/heading';
import { Separator } from '@twilio-paste/core/separator';
import { Stack } from '@twilio-paste/core/stack';
import { Text } from '@twilio-paste/core/text';

import { EmptyState } from './states';

interface Props {
  traits: Record<string, Record<string, unknown>>;
}

/** Coerce a trait value (string | number | boolean | object) to display text. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A single trait key/value row. */
function TraitRow({ label, value }: { label: string; value: unknown }) {
  return (
    <Box display="flex" columnGap="space40" alignItems="flex-start">
      <Box minWidth="120px">
        <Text as="div" fontWeight="fontWeightSemibold" fontSize="fontSize20" color="colorTextWeak">
          {label}
        </Text>
      </Box>
      <Text as="div" fontSize="fontSize30">
        {renderValue(value)}
      </Text>
    </Box>
  );
}

/** Traits grouped by Trait Group, each group a labelled card of key/value pairs. */
export function TraitsTab({ traits }: Props) {
  const groups = Object.entries(traits).filter(
    ([, fields]) => fields && typeof fields === 'object' && Object.keys(fields).length > 0,
  );

  if (groups.length === 0) {
    return <EmptyState message="No traits recorded for this customer." />;
  }

  return (
    <Box paddingTop="space50">
      <Stack orientation="vertical" spacing="space60">
        {groups.map(([groupName, fields]) => (
          <Card key={groupName} padding="space60">
            <Heading as="h4" variant="heading40" marginBottom="space0">
              {groupName}
            </Heading>
            <Separator orientation="horizontal" verticalSpacing="space40" />
            <Stack orientation="vertical" spacing="space40">
              {Object.entries(fields).map(([key, value]) => (
                <TraitRow key={key} label={key} value={value} />
              ))}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
