import React from 'react';
import { render, screen } from '@testing-library/react';
import { Theme } from '@twilio-paste/core/theme';

// ObservationsTab → states/LoadMoreButton → i18n → @twilio/flex-ui; stub Flex.
jest.mock('@twilio/flex-ui', () => ({
  Manager: { getInstance: () => ({ localization: { localeTag: 'en-US' } }) },
}));

import { ObservationsTab } from '../ObservationsTab';

const OBS = [{ id: 'o1', content: 'Prefers mornings', createdAt: '2026-01-02T00:00:00Z' }];

function renderTab(props: Record<string, unknown> = {}) {
  return render(
    <Theme.Provider theme="default">
      <ObservationsTab observations={OBS} {...props} />
    </Theme.Provider>,
  );
}

describe('ObservationsTab — Load more (C2)', () => {
  it('shows a Load more button when onLoadMore is provided', () => {
    renderTab({ onLoadMore: jest.fn() });
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('omits the button when onLoadMore is absent (at max / nothing more)', () => {
    renderTab();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
