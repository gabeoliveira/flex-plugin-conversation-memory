import React from 'react';
import { render, screen } from '@testing-library/react';
import { Theme } from '@twilio-paste/core/theme';

// TraitsTab → i18n → @twilio/flex-ui; stub Flex, and mock runtimeConfig to drive
// the trait-group display config (D2).
jest.mock('@twilio/flex-ui', () => ({
  Manager: { getInstance: () => ({ localization: { localeTag: 'en-US' } }) },
}));
jest.mock('../../../runtimeConfig', () => ({ getRuntimeConfig: jest.fn(() => ({})) }));

import { TraitsTab } from '../TraitsTab';
import { getRuntimeConfig } from '../../../runtimeConfig';

const mockRuntime = getRuntimeConfig as jest.MockedFunction<typeof getRuntimeConfig>;

const TRAITS = {
  Contact: { firstName: 'Rafaela' },
  DasaClient: { tier: 'Alta' },
  Internal: { note: 'secret' },
};

function renderTab() {
  return render(
    <Theme.Provider theme="default">
      <TraitsTab traits={TRAITS} />
    </Theme.Provider>,
  );
}

afterEach(() => mockRuntime.mockReturnValue({}));

describe('TraitsTab — configurable display (D2)', () => {
  it('renders all groups by default', () => {
    mockRuntime.mockReturnValue({});
    renderTab();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('DasaClient')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  it('hides configured groups', () => {
    mockRuntime.mockReturnValue({ traitGroups: { hidden: ['Internal'] } });
    renderTab();
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('applies a configured label', () => {
    mockRuntime.mockReturnValue({ traitGroups: { labels: { DasaClient: 'Cliente Dasa' } } });
    renderTab();
    expect(screen.getByText('Cliente Dasa')).toBeInTheDocument();
    expect(screen.queryByText('DasaClient')).not.toBeInTheDocument();
  });

  it('orders groups per config (listed first, in order)', () => {
    mockRuntime.mockReturnValue({ traitGroups: { order: ['DasaClient', 'Contact'] } });
    renderTab();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.indexOf('DasaClient')).toBeLessThan(headings.indexOf('Contact'));
  });

  it('shows the empty state when every group is hidden', () => {
    mockRuntime.mockReturnValue({
      traitGroups: { hidden: ['Contact', 'DasaClient', 'Internal'] },
    });
    renderTab();
    expect(screen.getByText('No traits recorded for this customer.')).toBeInTheDocument();
  });
});
