import { buildIdentifierCandidates, describeIdentifier } from '../identifiers';

describe('buildIdentifierCandidates', () => {
  it('returns an empty list when attrs is undefined', () => {
    expect(buildIdentifierCandidates(undefined)).toEqual([]);
  });

  it('returns an empty list when no usable identifier is present', () => {
    expect(buildIdentifierCandidates({ name: 'Rafaela', count: 3 })).toEqual([]);
  });

  it('whatsapp channel: tries the raw whatsapp address first, then the phone', () => {
    expect(
      buildIdentifierCandidates({
        channelType: 'whatsapp',
        customerAddress: 'whatsapp:+5511976932682',
      }),
    ).toEqual([
      { idType: 'whatsapp', value: 'whatsapp:+5511976932682' },
      { idType: 'phone', value: '+5511976932682' },
    ]);
  });

  it('sms channel: phone only', () => {
    expect(buildIdentifierCandidates({ channelType: 'sms', from: '+5511976932682' })).toEqual([
      { idType: 'phone', value: '+5511976932682' },
    ]);
  });

  it('voice channel: phone from customerPhone', () => {
    expect(
      buildIdentifierCandidates({ channelType: 'voice', customerPhone: '+5511976932682' }),
    ).toEqual([{ idType: 'phone', value: '+5511976932682' }]);
  });

  it('whatsapp username + a separate phone attribute: whatsapp first, then that phone', () => {
    expect(
      buildIdentifierCandidates({
        channelType: 'whatsapp',
        customerAddress: 'whatsapp:rafaela.m',
        customerPhone: '+5511976932682',
      }),
    ).toEqual([
      { idType: 'whatsapp', value: 'whatsapp:rafaela.m' },
      { idType: 'phone', value: '+5511976932682' },
    ]);
  });

  it('email channel: email first, phone appended as a universal fallback', () => {
    expect(
      buildIdentifierCandidates({
        channelType: 'email',
        customerEmail: 'rafaela@example.com',
        customerPhone: '+5511976932682',
      }),
    ).toEqual([
      { idType: 'email', value: 'rafaela@example.com' },
      { idType: 'phone', value: '+5511976932682' },
    ]);
  });

  it('infers the whatsapp channel from the address prefix when channelType is absent', () => {
    expect(buildIdentifierCandidates({ customerAddress: 'whatsapp:+5511976932682' })).toEqual([
      { idType: 'whatsapp', value: 'whatsapp:+5511976932682' },
      { idType: 'phone', value: '+5511976932682' },
    ]);
  });

  it('ignores non-string attribute values', () => {
    expect(buildIdentifierCandidates({ channelType: 'sms', from: 12345, customerPhone: '+55119' }))
      .toEqual([{ idType: 'phone', value: '+55119' }]);
  });

  it('does not emit duplicate {idType, value} pairs', () => {
    const result = buildIdentifierCandidates({ channelType: 'sms', from: '+5511976932682' });
    // phone is pushed once (native) and the universal fallback dedupes.
    expect(result).toEqual([{ idType: 'phone', value: '+5511976932682' }]);
  });
});

describe('describeIdentifier', () => {
  it('returns empty string for no candidates', () => {
    expect(describeIdentifier([])).toBe('');
  });

  it('prefers a phone candidate', () => {
    expect(
      describeIdentifier([
        { idType: 'whatsapp', value: 'whatsapp:+5511976932682' },
        { idType: 'phone', value: '+5511976932682' },
      ]),
    ).toBe('+5511976932682');
  });

  it('falls back to the first candidate, stripping whatsapp:', () => {
    expect(describeIdentifier([{ idType: 'whatsapp', value: 'whatsapp:rafaela.m' }])).toBe(
      'rafaela.m',
    );
  });
});
