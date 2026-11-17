import { describe, expect, it } from 'vitest';
import { formatPhone, toE164 } from '../lib/phone';

describe('toE164', () => {
  it.each([
    ['613 555 0123', '+16135550123'],
    ['(613) 555-0123', '+16135550123'],
    ['+1 613 555 0123', '+16135550123'],
    ['1-613-555-0123', '+16135550123'],
  ])('reads %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(['', '555 0123', '613 555 012345', '013 555 0123', '613 155 0123', '+44 20 7946 0000'])(
    'refuses %s',
    (input) => {
      expect(toE164(input)).toBeNull();
    },
  );
});

describe('formatPhone', () => {
  it('formats a North American number', () => {
    expect(formatPhone('+16135550123')).toBe('(613) 555-0123');
  });

  it('leaves anything else alone', () => {
    expect(formatPhone('+442079460000')).toBe('+442079460000');
  });
});
