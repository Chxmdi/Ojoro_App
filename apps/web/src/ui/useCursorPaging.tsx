import { useState } from 'react';

import { currentCursor, nextStack, prevStack, type CursorStack } from '../lib/moderation';

/** Opaque-cursor paging that resets whenever the filters (key) change. */
export function useCursorPaging(key: string) {
  const [paging, setPaging] = useState<{ key: string; stack: CursorStack }>({ key, stack: [null] });
  const stack = paging.key === key ? paging.stack : [null];
  return {
    page: stack.length,
    cursor: currentCursor(stack),
    next: (cursor: string | null) => setPaging({ key, stack: nextStack(stack, cursor) }),
    prev: () => setPaging({ key, stack: prevStack(stack) }),
  };
}
