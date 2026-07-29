import React from 'react';
import { render, screen } from '@testing-library/react';
import { Theme } from '@twilio-paste/core/theme';

// CommunicationsTab → i18n → @twilio/flex-ui; stub Flex.
jest.mock('@twilio/flex-ui', () => ({
  Manager: { getInstance: () => ({ localization: { localeTag: 'en-US' } }) },
}));

import { CommunicationsTab } from '../CommunicationsTab';

function renderTab(props: Record<string, unknown>) {
  return render(
    <Theme.Provider theme="default">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <CommunicationsTab {...(props as any)} />
    </Theme.Provider>,
  );
}

describe('CommunicationsTab (D4)', () => {
  it('renders messages with channel + author', () => {
    renderTab({
      communications: [
        { id: 'c1', content: 'Where is my order?', channel: 'whatsapp', author: 'Customer' },
      ],
    });
    expect(screen.getByText('Where is my order?')).toBeInTheDocument();
    expect(screen.getByText('whatsapp')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('shows the empty state when there are none', () => {
    renderTab({ communications: [] });
    expect(screen.getByText('No recent messages for this customer.')).toBeInTheDocument();
  });
});
