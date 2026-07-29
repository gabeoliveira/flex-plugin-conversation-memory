import React, { useEffect, useRef, useState } from 'react';
import * as Flex from '@twilio/flex-ui';
import { withTaskContext } from '@twilio/flex-ui';

import { Box } from '@twilio-paste/core/box';
import { Text } from '@twilio-paste/core/text';
import { Button } from '@twilio-paste/core/button';

import { buildIdentifierCandidates, describeIdentifier } from '../../utils/identifiers';
import { getFlexToken } from '../../utils/flexToken';
import { fetchMemory, type MemoryResponse } from '../../api/fetchMemory';
import { getCachedMemory, setCachedMemory, invalidateMemory, memoryCacheKey } from '../../api/memoryCache';
import { friendlyError } from '../../api/errors';
import { getStrings } from '../../i18n';
import { communicationsEnabled } from '../../config';
import { MemoryTabs } from './MemoryTabs';
import { LoadingState, EmptyState, ErrorState } from './states';

const OBS_DEFAULT = 10;
const SUM_DEFAULT = 5;
const LIMIT_MAX = 20; // Recall's ceiling

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
  const s = getStrings();
  const candidates = buildIdentifierCandidates(task?.attributes, getConversationType(task));
  const displayId = describeIdentifier(candidates);
  const token = getFlexToken();
  // Stable dependency for the effect — candidates is rebuilt each render.
  const candidatesKey = JSON.stringify(candidates);

  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [obsLimit, setObsLimit] = useState(OBS_DEFAULT);
  const [sumLimit, setSumLimit] = useState(SUM_DEFAULT);
  const [loadingMore, setLoadingMore] = useState(false);

  const cacheKey = memoryCacheKey(candidatesKey, obsLimit, sumLimit);
  const loadKey = `${candidatesKey}|${reloadNonce}`;
  const prevLoadKey = useRef('');

  useEffect(() => {
    if (candidates.length === 0) {
      setState({ kind: 'idle' });
      return;
    }
    // A change in candidates/refresh is a full (re)load; a change only in limits
    // is a background "load more" that keeps the current data + tab on screen.
    const limitOnly = prevLoadKey.current === loadKey;
    prevLoadKey.current = loadKey;

    const cached = getCachedMemory(cacheKey);
    if (cached) {
      setState({ kind: 'ok', data: cached });
      setLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    if (limitOnly) setLoadingMore(true);
    else setState({ kind: 'loading' });

    fetchMemory(
      {
        identifiers: candidates,
        token,
        observationsLimit: obsLimit,
        summariesLimit: sumLimit,
        communicationsLimit: communicationsEnabled() ? 10 : undefined,
      },
      controller.signal,
    )
      .then((data) => {
        setCachedMemory(cacheKey, data);
        setState({ kind: 'ok', data });
        setLoadingMore(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadingMore(false);
        if (!limitOnly) setState({ kind: 'error', message: friendlyError(err) });
      });
    return () => controller.abort();
    // reloadNonce retriggers a fresh fetch on manual refresh; limits drive "load more".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey, reloadNonce, obsLimit, sumLimit]);

  if (candidates.length === 0) {
    return <EmptyState message={s.noIdentifier} />;
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
          {s.panelTitle}
          {displayId ? (
            <Text as="span" fontWeight="fontWeightNormal" color="colorTextWeak">
              {' '}· {displayId}
            </Text>
          ) : null}
        </Text>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            invalidateMemory(cacheKey); // Refresh bypasses the cache
            setReloadNonce((n) => n + 1);
          }}
          disabled={state.kind === 'loading'}
        >
          {s.refresh}
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
                {s.ambiguousProfiles(state.data.profileCount ?? 0)}
              </Text>
            </Box>
          ) : null}
          <MemoryTabs
            data={state.data}
            identifiers={candidates}
            token={token}
            loadingMore={loadingMore}
            onLoadMoreObservations={
              obsLimit < LIMIT_MAX && state.data.observations.length >= obsLimit
                ? () => setObsLimit(LIMIT_MAX)
                : undefined
            }
            onLoadMoreSummaries={
              sumLimit < LIMIT_MAX && state.data.summaries.length >= sumLimit
                ? () => setSumLimit(LIMIT_MAX)
                : undefined
            }
          />
        </>
      )}
    </Box>
  );
}

export const MemoryPanel = withTaskContext(MemoryPanelImpl);
