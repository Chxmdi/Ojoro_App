import { describe, expect, it } from 'vitest';

import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('names the tabs and the welcome screen', () => {
    expect(pageTitle('/')).toBe('Home · Ojoro');
    expect(pageTitle('/discover')).toBe('Discover · Ojoro');
    expect(pageTitle('/welcome')).toBe('Ojoro');
  });

  it('matches routes with ids', () => {
    expect(pageTitle('/plan/f000/game-on')).toBe('GAME ON · Ojoro');
    expect(pageTitle('/host/c6/session/047b/requests')).toBe('Requests · Ojoro');
    expect(pageTitle('/clan/join/ABC123')).toBe('Join a clan · Ojoro');
  });

  it('prefers literal routes over ids', () => {
    expect(pageTitle('/challenge/new')).toBe('CALL OUT · Ojoro');
    expect(pageTitle('/challenge/d100')).toBe('Call-Out · Ojoro');
    expect(pageTitle('/crew/join')).toBe('Join a crew · Ojoro');
    expect(pageTitle('/crew/c100')).toBe('Crew · Ojoro');
  });

  it('ignores the query and trailing slashes', () => {
    expect(pageTitle('/code?phone=%2B1555')).toBe('Enter the code · Ojoro');
    expect(pageTitle('/pay/return/')).toBe('Payment · Ojoro');
  });

  it('says nothing is here for unknown routes', () => {
    expect(pageTitle('/no-such-route')).toBe('Nothing here · Ojoro');
  });
});
