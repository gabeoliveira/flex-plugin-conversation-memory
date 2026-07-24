import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@twilio-paste/core/theme';

// withTaskContext is an HOC that injects `task` from Flex context. For these
// smoke tests we make it a pass-through so we can drive `task` via props.
jest.mock('@twilio/flex-ui', () => ({
  withTaskContext: (Component: React.ComponentType) => Component,
  Manager: { getInstance: () => ({ user: { token: 'test-token' } }) },
}));

// Stub the tabs shell so the smoke test focuses on MemoryPanel's branching,
// not on rendering Paste Tabs (covered well enough by the data wiring here).
jest.mock('../MemoryTabs', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MemoryTabs: ({ data }: any) => (
    <div data-testid="memory-tabs">observations:{data.observations.length}</div>
  ),
}));

// Mock the network layer.
jest.mock('../../../api/fetchMemory', () => ({
  fetchMemory: jest.fn(),
}));

import { MemoryPanel } from '../MemoryPanel';
import { fetchMemory } from '../../../api/fetchMemory';

const mockFetchMemory = fetchMemory as jest.MockedFunction<typeof fetchMemory>;

function renderPanel(attributes: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = { attributes } as any;
  return render(
    <Theme.Provider theme="default">
      {/* MemoryPanel is the (pass-through-mocked) wrapped component */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {React.createElement(MemoryPanel as any, { task })}
    </Theme.Provider>,
  );
}

const SAMPLE = {
  identifier: '+5511976932682',
  matchedBy: 'phone',
  profileId: 'mem_profile_123',
  profileCreatedAt: '2026-01-01T00:00:00Z',
  traits: { Contact: { firstName: 'Rafaela' } },
  observations: [{ id: 'o1', content: 'Prefers mornings', createdAt: '2026-01-02T00:00:00Z' }],
  summaries: [],
};

beforeEach(() => {
  mockFetchMemory.mockReset();
});

describe('MemoryPanel', () => {
  it('renders the empty state when no identifier is on the task', () => {
    renderPanel({ unrelated: 'x' });
    expect(screen.getByText('No customer identifier on this task.')).toBeInTheDocument();
    expect(mockFetchMemory).not.toHaveBeenCalled();
  });

  it('fetches and renders memory tabs on success', async () => {
    mockFetchMemory.mockResolvedValue(SAMPLE);
    renderPanel({ channelType: 'sms', from: '+5511976932682' });

    const tabs = await screen.findByTestId('memory-tabs');
    expect(tabs).toHaveTextContent('observations:1');
    expect(mockFetchMemory).toHaveBeenCalledWith(
      { identifiers: [{ idType: 'phone', value: '+5511976932682' }], token: 'test-token' },
      expect.anything(),
    );
  });

  it('sends the channel-aware candidate list (whatsapp first, then phone)', async () => {
    mockFetchMemory.mockResolvedValue(SAMPLE);
    renderPanel({ channelType: 'whatsapp', customerAddress: 'whatsapp:+5511976932682' });

    await screen.findByTestId('memory-tabs');
    expect(mockFetchMemory).toHaveBeenCalledWith(
      {
        identifiers: [
          { idType: 'whatsapp', value: 'whatsapp:+5511976932682' },
          { idType: 'phone', value: '+5511976932682' },
        ],
        token: 'test-token',
      },
      expect.anything(),
    );
  });

  it('renders an error state and a Refresh control when the fetch fails', async () => {
    mockFetchMemory.mockRejectedValue(new Error('boom'));
    renderPanel({ from: '+5511976932682' });

    await waitFor(() =>
      expect(screen.getByText(/Failed to load customer memory/)).toBeInTheDocument(),
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
