import { ojoroErrorCodes } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import { allErrorMessages, errorMessage } from './errorMessages';

describe('error messages', () => {
  it('has words for every contract code', () => {
    for (const code of ojoroErrorCodes) {
      expect(errorMessage({ kind: 'ojoro', code, detail: null })).toBeTruthy();
    }
    expect(errorMessage({ kind: 'network', code: 'network', detail: null })).toMatch(/offline/);
  });

  it('follows the voice: sentences, no exclamation marks, no emoji', () => {
    for (const message of Object.values(allErrorMessages)) {
      expect(message).not.toMatch(/!/);
      expect(message).toMatch(/[.]$/);
      expect(message).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
