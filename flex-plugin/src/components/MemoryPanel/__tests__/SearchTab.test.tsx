import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Theme } from '@twilio-paste/core/theme';

jest.mock('../../../api/fetchMemory', () => ({ fetchMemory: jest.fn() }));
jest.mock('../../../api/searchKnowledge', () => ({ searchKnowledge: jest.fn() }));
jest.mock('../../../api/summarize', () => ({ summarize: jest.fn() }));

import { SearchTab } from '../SearchTab';
import { fetchMemory } from '../../../api/fetchMemory';
import { searchKnowledge } from '../../../api/searchKnowledge';
import { summarize } from '../../../api/summarize';

const mockFetchMemory = fetchMemory as jest.MockedFunction<typeof fetchMemory>;
const mockSearchKnowledge = searchKnowledge as jest.MockedFunction<typeof searchKnowledge>;
const mockSummarize = summarize as jest.MockedFunction<typeof summarize>;

const IDENTIFIERS = [{ idType: 'phone', value: '+5511976932682' }];

function renderSearch() {
  return render(
    <Theme.Provider theme="default">
      <SearchTab identifiers={IDENTIFIERS} profileId="mem_profile_1" token="tok" />
    </Theme.Provider>,
  );
}

function submit(query: string) {
  fireEvent.change(screen.getByLabelText('Search customer memory and knowledge base'), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}

beforeEach(() => {
  mockFetchMemory.mockReset();
  mockSearchKnowledge.mockReset();
  mockSummarize.mockReset();
});

describe('SearchTab', () => {
  it('shows the idle prompt before any search', () => {
    renderSearch();
    expect(
      screen.getByText("Search this customer's memory and your knowledge base."),
    ).toBeInTheDocument();
    expect(mockFetchMemory).not.toHaveBeenCalled();
  });

  it('fires both memory and knowledge search on submit and renders both sections', async () => {
    mockFetchMemory.mockResolvedValue({
      identifier: '+55',
      matchedBy: 'phone',
      profileId: 'mem_profile_1',
      profileCreatedAt: null,
      traits: {},
      observations: [{ id: 'o1', content: 'Prefers mornings', createdAt: 't' }],
      summaries: [],
    });
    mockSearchKnowledge.mockResolvedValue({
      query: 'refund',
      chunks: [{ content: 'Refunds within 30 days' }],
    });

    renderSearch();
    submit('refund');

    expect(await screen.findByText('Prefers mornings')).toBeInTheDocument();
    expect(await screen.findByText('Refunds within 30 days')).toBeInTheDocument();
    expect(screen.getByText('This customer')).toBeInTheDocument();
    expect(screen.getByText('Knowledge base')).toBeInTheDocument();

    // Memory search reuses the resolved profileId; both carry the token + query.
    expect(mockFetchMemory).toHaveBeenCalledWith({
      identifiers: IDENTIFIERS,
      profileId: 'mem_profile_1',
      query: 'refund',
      token: 'tok',
    });
    expect(mockSearchKnowledge).toHaveBeenCalledWith({ query: 'refund', token: 'tok' });
  });

  it('does not search on an empty query', () => {
    renderSearch();
    // Button is disabled for empty input.
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });

  it('summarizes the current results on demand, passing them to the endpoint', async () => {
    mockFetchMemory.mockResolvedValue({
      identifier: '+55',
      matchedBy: 'phone',
      profileId: 'mem_profile_1',
      profileCreatedAt: null,
      traits: {},
      observations: [{ id: 'o1', content: 'Prefers mornings', createdAt: 't', source: 'ci', score: 0.7 }],
      summaries: [],
    });
    mockSearchKnowledge.mockResolvedValue({
      query: 'refund',
      chunks: [{ content: 'Refunds within 30 days', score: 0.6 }],
    });
    mockSummarize.mockResolvedValue({
      answer: 'Customer prefers mornings [M1]; refunds are 30 days [K1].',
      model: 'gpt-4o-mini',
      grounded: true,
    });

    renderSearch();
    submit('refund');
    await screen.findByText('Prefers mornings');

    fireEvent.click(screen.getByRole('button', { name: 'Summarize results' }));

    expect(await screen.findByText(/Customer prefers mornings/)).toBeInTheDocument();
    expect(mockSummarize).toHaveBeenCalledWith({
      query: 'refund',
      memory: [{ content: 'Prefers mornings', source: 'ci', score: 0.7 }],
      knowledge: [{ content: 'Refunds within 30 days', score: 0.6 }],
      token: 'tok',
    });
  });

  it('isolates an error to its own section', async () => {
    mockFetchMemory.mockRejectedValue(new Error('memory boom'));
    mockSearchKnowledge.mockResolvedValue({ query: 'x', chunks: [{ content: 'KB result' }] });

    renderSearch();
    submit('x');

    expect(await screen.findByText('memory boom')).toBeInTheDocument();
    expect(await screen.findByText('KB result')).toBeInTheDocument();
  });

  it('shows per-section empty states when a search returns nothing', async () => {
    mockFetchMemory.mockResolvedValue({
      identifier: '',
      matchedBy: null,
      profileId: null,
      profileCreatedAt: null,
      traits: {},
      observations: [],
      summaries: [],
    });
    mockSearchKnowledge.mockResolvedValue({ query: 'x', chunks: [] });

    renderSearch();
    submit('x');

    await waitFor(() => {
      expect(screen.getByText('No matching memory for this customer.')).toBeInTheDocument();
      expect(screen.getByText('No matching knowledge.')).toBeInTheDocument();
    });
  });
});
