import React, { useEffect, useState } from 'react';
import * as Flex from '@twilio/flex-ui';
import { withTaskContext } from '@twilio/flex-ui';

import { Box } from '@twilio-paste/core/box';
import { Text } from '@twilio-paste/core/text';
import { Button } from '@twilio-paste/core/button';

import { buildIdentifierCandidates, describeIdentifier } from '../../utils/identifiers';
import { getFlexToken } from '../../utils/flexToken';
import { fetchMemory, type MemoryResponse } from '../../api/fetchMemory';
import { friendlyError } from '../../api/errors';
import { MemoryTabs } from './MemoryTabs';
import { LoadingState, EmptyState, ErrorState } from './states';

interface Props {
  task?: Flex.ITask;
}

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: MemoryResponse }
  | { kind: 'error'; message: string };

/**
 * Modern Flex channel source: `ConversationHelper.conversationType` derived from
 * the task's conversation state (`task.channelType` is deprecated). Returns
 * undefined for voice / non-conversation tasks or if the API shape changes — the
 * identifier builder then falls back to a channel attribute / address inference.
 */
function getConversationType(task?: Flex.ITask): string | undefined {
  if (!task) return undefined;
  try {
    const state = Flex.StateHelper.getConversationStateForTask(task);
    if (!state) return undefined;
    return new Flex.ConversationHelper(state).conversationType || undefined;
  } catch {
    return undefined;
  }
}

function MemoryPanelImpl({ task }: Props) {
  const candidates = buildIdentifierCandidates(task?.attributes, getConversationType(task));
  const displayId = describeIdentifier(candidates);
  const token = getFlexToken();
  // Stable dependency for the effect — candidates is rebuilt each render.
  const candidatesKey = JSON.stringify(candidates);

  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (candidates.length === 0) {
      setState({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetchMemory({ identifiers: candidates, token }, controller.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: friendlyError(err) });
      });
    return () => controller.abort();
    // reloadNonce intentionally retriggers a fresh fetch on manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey, reloadNonce]);

  if (candidates.length === 0) {
    return <EmptyState message="No customer identifier on this task." />;
  }

  return (
    <Box maxHeight="100%" overflowY="auto" padding="space50">
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        columnGap="space40"
        marginBottom="space40"
      >
        <Text as="div" fontWeight="fontWeightSemibold" fontSize="fontSize30">
          Customer Memory
          {displayId ? (
            <Text as="span" fontWeight="fontWeightNormal" color="colorTextWeak">
              {' '}· {displayId}
            </Text>
          ) : null}
        </Text>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setReloadNonce((n) => n + 1)}
          disabled={state.kind === 'loading'}
        >
          Refresh
        </Button>
      </Box>

      {state.kind === 'loading' || state.kind === 'idle' ? (
        <LoadingState identifier={displayId} />
      ) : state.kind === 'error' ? (
        <ErrorState identifier={displayId} message={state.message} />
      ) : (
        <>
          {state.data.ambiguous ? (
            <Box marginBottom="space40">
              <Text as="div" fontSize="fontSize10" color="colorTextWeak">
                {state.data.profileCount} profiles match this identifier — showing the first. Confirm
                you have the right customer.
              </Text>
            </Box>
          ) : null}
          <MemoryTabs data={state.data} identifiers={candidates} token={token} />
        </>
      )}
    </Box>
  );
}

export const MemoryPanel = withTaskContext(MemoryPanelImpl);
