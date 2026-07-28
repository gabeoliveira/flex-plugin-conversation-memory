import React, { useState } from 'react';

import { Box } from '@twilio-paste/core/box';
import { Input } from '@twilio-paste/core/input';
import { Button } from '@twilio-paste/core/button';
import { Heading } from '@twilio-paste/core/heading';
import { Card } from '@twilio-paste/core/card';
import { Text } from '@twilio-paste/core/text';
import { Paragraph } from '@twilio-paste/core/paragraph';
import { Stack } from '@twilio-paste/core/stack';
import { Badge } from '@twilio-paste/core/badge';
import { Spinner } from '@twilio-paste/core/spinner';
import { Alert } from '@twilio-paste/core/alert';

import { EmptyState } from './states';
import { fetchMemory, type MemoryObservation, type MemorySummary } from '../../api/fetchMemory';
import { searchKnowledge, type KnowledgeChunk } from '../../api/searchKnowledge';
import { summarize, type SummarizeResponse } from '../../api/summarize';
import { captureTurn } from '../../api/captureTurn';
import { getAgentTraits } from '../../utils/flexToken';
import { summarizeEnabled } from '../../config';
import type { IdentifierCandidate } from '../../utils/identifiers';

/** Compact rendering of search results — the 'assistant' side of a captured search turn. */
function renderSearchResults(
  mem: Array<{ content: string }>,
  kb: Array<{ content: string }>,
): string {
  const snip = (items: Array<{ content: string }>, empty: string) =>
    items.length ? items.slice(0, 3).map((i) => i.content.slice(0, 200)).join(' | ') : empty;
  return `Memory: ${snip(mem, 'no memory results')}\nKnowledge: ${snip(kb, 'no knowledge results')}`;
}

interface Props {
  identifiers: IdentifierCandidate[];
  profileId: string | null;
  token: string;
}

type SectionState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; items: T[] }
  | { kind: 'error'; message: string };

/** Unified search: queries the customer's memory and the org knowledge base in parallel. */
export function SearchTab({ identifiers, profileId, token }: Props) {
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [memory, setMemory] = useState<SectionState<MemoryObservation | MemorySummary>>({
    kind: 'idle',
  });
  const [knowledge, setKnowledge] = useState<SectionState<KnowledgeChunk>>({ kind: 'idle' });
  const [summary, setSummary] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; data: SummarizeResponse } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const memItems = memory.kind === 'ok' ? memory.items : [];
  const knowledgeItems = knowledge.kind === 'ok' ? knowledge.items : [];
  const hasResults = memItems.length > 0 || knowledgeItems.length > 0;
  const showSummarize = summarizeEnabled();

  const runSearch = () => {
    const query = term.trim();
    if (!query) return;
    setSubmitted(query);
    setSummary({ kind: 'idle' }); // a new search invalidates the previous summary

    // Memory search — reuses the resolved profile when we have it.
    // Recall sorts observations and summaries by relevance *within* each list;
    // merge them into one list sorted by score so the most relevant shows first
    // (and is fed to the summarizer first), regardless of type.
    setMemory({ kind: 'loading' });
    const memP = fetchMemory({ identifiers, profileId, query, token })
      .then((r) => {
        const items = [...r.observations, ...r.summaries].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0),
        );
        setMemory({ kind: 'ok', items });
        return items as Array<{ content: string }>;
      })
      .catch((err) => {
        setMemory({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        return [] as Array<{ content: string }>;
      });

    // Knowledge search — org-wide, independent of the customer.
    setKnowledge({ kind: 'loading' });
    const knowP = searchKnowledge({ query, token })
      .then((r) => {
        setKnowledge({ kind: 'ok', items: r.chunks });
        return r.chunks as Array<{ content: string }>;
      })
      .catch((err) => {
        setKnowledge({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        return [] as Array<{ content: string }>;
      });

    // Capture the search turn once both settle (fire-and-forget, agent-productivity).
    Promise.all([memP, knowP]).then(([mem, kb]) => {
      captureTurn({
        kind: 'search',
        query,
        answer: renderSearchResults(mem, kb),
        meta: { memoryCount: mem.length, knowledgeCount: kb.length },
        agent: getAgentTraits(),
        token,
      });
    });
  };

  const runSummarize = () => {
    setSummary({ kind: 'loading' });
    summarize({
      query: submitted,
      memory: memItems.map((m) => ({ content: m.content, source: m.source, score: m.score })),
      knowledge: knowledgeItems.map((k) => ({ content: k.content, score: k.score })),
      token,
    })
      .then((data) => {
        setSummary({ kind: 'ok', data });
        captureTurn({
          kind: 'summarize',
          query: submitted,
          answer: data.answer,
          meta: {
            memoryCount: memItems.length,
            knowledgeCount: knowledgeItems.length,
            grounded: data.grounded,
          },
          agent: getAgentTraits(),
          token,
        });
      })
      .catch((err) =>
        setSummary({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
  };

  return (
    <Box paddingTop="space50">
      <Box
        as="form"
        display="flex"
        columnGap="space30"
        marginBottom="space50"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <Input
          aria-label="Search customer memory and knowledge base"
          type="text"
          placeholder="Search memory and knowledge…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button variant="primary" type="submit" disabled={!term.trim()}>
          Search
        </Button>
      </Box>

      {submitted ? (
        <Stack orientation="vertical" spacing="space70">
          {showSummarize && hasResults ? (
            <SummaryBlock summary={summary} onSummarize={runSummarize} />
          ) : null}

          <Section title="This customer" state={memory} empty="No matching memory for this customer.">
            {(item, i) => (
              <Card key={item.id} padding="space50">
                <ResultMeta label={`M${i + 1}`} source={item.source} score={item.score} />
                <Paragraph marginBottom="space0">{item.content}</Paragraph>
              </Card>
            )}
          </Section>

          <Section title="Knowledge base" state={knowledge} empty="No matching knowledge.">
            {(chunk, i) => (
              <Card key={i} padding="space50">
                <ResultMeta label={`K${i + 1}`} score={chunk.score} />
                <Paragraph marginBottom="space0">{chunk.content}</Paragraph>
              </Card>
            )}
          </Section>
        </Stack>
      ) : (
        <EmptyState message="Search this customer's memory and your knowledge base." />
      )}
    </Box>
  );
}

/** Citation label (M#/K#) + source badge + semantic-match % for a search result. */
function ResultMeta({ label, source, score }: { label: string; source?: string; score?: number }) {
  const hasScore = typeof score === 'number';
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      columnGap="space40"
      marginBottom="space20"
    >
      <Box display="flex" alignItems="center" columnGap="space20">
        <Text as="span" fontSize="fontSize10" fontWeight="fontWeightBold" color="colorTextWeak">
          {label}
        </Text>
        {source ? (
          <Badge as="span" variant="decorative10">
            {source}
          </Badge>
        ) : null}
      </Box>
      {hasScore ? (
        <Text as="span" fontSize="fontSize10" color="colorTextWeak">
          {Math.round((score as number) * 100)}% match
        </Text>
      ) : null}
    </Box>
  );
}

interface SummaryBlockProps {
  summary:
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; data: SummarizeResponse }
    | { kind: 'error'; message: string };
  onSummarize: () => void;
}

/** "Summarize" action + the grounded, cited AI answer above the raw results. */
function SummaryBlock({ summary, onSummarize }: SummaryBlockProps) {
  return (
    <Box>
      <Box marginBottom="space40">
        <Button
          variant="secondary"
          size="small"
          onClick={onSummarize}
          disabled={summary.kind === 'loading'}
        >
          {summary.kind === 'loading' ? 'Summarizing…' : 'Summarize results'}
        </Button>
      </Box>

      {summary.kind === 'loading' ? (
        <Box display="flex" alignItems="center" columnGap="space30">
          <Spinner decorative={false} title="Summarizing" />
          <Text as="span">Summarizing the results…</Text>
        </Box>
      ) : summary.kind === 'error' ? (
        <Alert variant="error">
          <Text as="span">{summary.message}</Text>
        </Alert>
      ) : summary.kind === 'ok' ? (
        <Card padding="space60">
          <Heading as="h4" variant="heading40" marginBottom="space0">
            Assistant summary
          </Heading>
          <Box marginY="space30">
            <Paragraph marginBottom="space0">{summary.data.answer}</Paragraph>
          </Box>
          <Text as="div" fontSize="fontSize10" color="colorTextWeak">
            AI-generated from the results below ([M#]/[K#]) — verify against the sources.
          </Text>
        </Card>
      ) : null}
    </Box>
  );
}

interface SectionProps<T> {
  title: string;
  state: SectionState<T>;
  empty: string;
  children: (item: T, index: number) => React.ReactNode;
}

function Section<T>({ title, state, empty, children }: SectionProps<T>) {
  return (
    <Box>
      <Box marginBottom="space40">
        <Heading as="h4" variant="heading40" marginBottom="space0">
          {title}
        </Heading>
      </Box>
      {state.kind === 'loading' ? (
        <Box display="flex" alignItems="center" columnGap="space30">
          <Spinner decorative={false} title={`Searching ${title}`} />
          <Text as="span">Searching…</Text>
        </Box>
      ) : state.kind === 'error' ? (
        <Alert variant="error">
          <Text as="span">{state.message}</Text>
        </Alert>
      ) : state.kind === 'ok' && state.items.length > 0 ? (
        <Stack orientation="vertical" spacing="space40">
          {state.items.map((item, i) => children(item, i))}
        </Stack>
      ) : state.kind === 'ok' ? (
        <EmptyState message={empty} />
      ) : null}
    </Box>
  );
}
