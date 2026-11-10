#!/usr/bin/env node
// Accessibility audit of every route of the Expo web app and the staff admin web app, at 390pt.
//
//   node apps/mobile/e2e/a11y-audit.mjs [--only <substring>] [--app mobile|admin] [--out <dir>]
//
// Needs: the local Supabase stack (seeded), the Expo web dev server (APP_URL, default
// http://localhost:8100), the admin dev server (ADMIN_URL, default http://127.0.0.1:5174), Playwright
// and axe-core (devDependency). Read-only: it signs seeded people in (code 123456) and only loads
// screens; it never taps anything that writes. Dynamic ids come from the contract "Local data"
// sections, and the time-relative ones (plans, activities, host sessions) are looked up in the local
// database with psql at start, so a stale seed only changes which state a screen shows.
//
// For each route it records:
//   axe        axe-core violations (WCAG 2.2 A/AA + best-practice), by rule id and node count
//   names      interactive elements without an accessible name, or focusable without a role
//   targets    interactive elements smaller than 44 × 44 (I'M DOWN commit buttons below 56 tall)
//   headings   none, no h1, more than one h1, or skipped levels
//   colour     small text-less, label-less coloured marks (possible colour-only status: review)
//   motion     with prefers-reduced-motion: reduce, any CSS/WAAPI animation or transition over
//              120 ms, or a JS-driven style animation running over 150 ms
//   text200    text styles at native font scale 200% (display capped at 1.3×): text clipped by an overflow-hidden
//              ancestor, text boxes overlapping each other, and single-line truncations
//
// It prints a per-route table, and writes report.json, report.md and screenshots (normal and 200%)
// into --out (default A11Y_OUT or ./a11y-out). Exit code 0 always: this is an audit, not a gate.
/* global getComputedStyle, CSS, MutationObserver, performance */
// The check functions below run inside the page (page.evaluate), where these browser globals exist.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY = flag('only');
const ONLY_APP = flag('app');
const OUT = resolve(flag('out') ?? process.env.A11Y_OUT ?? 'a11y-out');
const APP = (process.env.APP_URL ?? process.env.E2E_APP_URL ?? 'http://localhost:8100').replace(/\/$/, '');
const ADMIN = (process.env.ADMIN_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PUBLISHABLE =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(join(OUT, 'shots'), { recursive: true });

// People ------------------------------------------------------------------------------------------
const PEOPLE = {
  chimdi: { phone: '+15555550100', id: 'a0000000-0000-4000-8000-000000000001' },
  ade: { phone: '+15555550101', id: 'a0000000-0000-4000-8000-000000000002' },
  lena: { phone: '+15555550103', id: 'a0000000-0000-4000-8000-000000000004' },
  staff: { phone: '+15555550190', id: 'a0000000-0000-4000-8000-000000000090' },
};

async function signIn(phone) {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.verifyOtp({ phone, token: '123456', type: 'sms' });
  if (error) throw new Error(`sign-in ${phone}: ${error.message}`);
  return data.session;
}

function storageState(session, app) {
  if (!session) return undefined;
  const origin = app === 'admin' ? ADMIN : APP;
  const name = app === 'admin' ? 'ojoro-staff-auth' : 'sb-127-auth-token';
  return {
    cookies: [],
    origins: [{ origin, localStorage: [{ name, value: JSON.stringify(session) }] }],
  };
}

// Ids -------------------------------------------------------------------------------------------
function sql(query) {
  try {
    return execFileSync('psql', [DB, '-At', '-c', query], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')[0];
  } catch {
    return '';
  }
}
const C = PEOPLE.chimdi.id;
const planOf = (statuses) =>
  sql(`select p.id from public.plans p join public.plan_members m on m.plan_id = p.id and m.user_id = '${C}'
       where p.status in (${statuses}) order by (p.starts_at > now()) desc, p.starts_at desc limit 1`);
const activityOf = (statuses) =>
  sql(`select a.id from public.activities a join public.attendance t on t.activity_id = a.id and t.user_id = '${C}'
       where a.status in (${statuses}) order by a.starts_at desc limit 1`);

const PROGRAM = 'c6000000-0000-4000-8000-000000000001';
const ids = {
  forming: planOf(`'forming'`) || 'f0000000-0000-4000-8000-000000000011',
  gameOn: planOf(`'game_on'`) || planOf(`'forming'`),
  confirmed: activityOf(`'confirmed'`),
  live: activityOf(`'live'`) || activityOf(`'after'`),
  after: activityOf(`'after'`),
  complete:
    sql(`select r.activity_id from public.recaps r join public.attendance t on t.activity_id = r.activity_id
         and t.user_id = '${C}' where r.finalized_at is not null order by r.occurred_at desc limit 1`) ||
    activityOf(`'complete'`),
  session: sql(`select id from public.host_sessions where series_id = 'c6000000-0000-4000-8000-000000000011'
                and starts_at > now() order by starts_at limit 1`),
  beginners: sql(`select id from public.host_sessions where series_id = 'c6000000-0000-4000-8000-000000000013'
                  and starts_at > now() order by starts_at limit 1`),
};

// Routes ------------------------------------------------------------------------------------------
const m = (path, as, note) => ({ app: 'mobile', path, as, note });
const a = (path, note) => ({ app: 'admin', path, as: 'staff', note });
const ROUTES = [
  m('/welcome', null),
  m('/phone', null),
  m('/code?phone=%2B15555550100', null),
  m('/name', 'lena', 'onboarding (Lena hasn’t finished)'),
  m('/sports', 'lena'),
  m('/when', 'lena'),
  m('/area', 'lena'),
  m('/privacy', 'lena'),
  m('/', 'chimdi', 'Home'),
  m('/discover', 'chimdi'),
  m('/create', 'chimdi'),
  m('/compete', 'chimdi'),
  m('/you', 'chimdi'),
  m('/updates', 'chimdi'),
  m('/pulse', 'chimdi'),
  m('/passport', 'chimdi'),
  m(`/profile/${PEOPLE.ade.id}`, 'chimdi'),
  m(`/profile/${PEOPLE.ade.id}/passport`, 'chimdi'),
  m(`/plan/${ids.forming}`, 'chimdi', 'plan forming'),
  m(`/plan/${ids.forming}/pull-in`, 'chimdi'),
  m(`/plan/${ids.gameOn}/game-on`, 'chimdi'),
  m(`/activity/${ids.confirmed}`, 'chimdi', 'confirmed'),
  m(`/activity/${ids.confirmed}/chat`, 'chimdi'),
  m(`/activity/${ids.confirmed}/check-in`, 'chimdi'),
  m(`/activity/${ids.live}/live`, 'chimdi', 'live (or latest after)'),
  m(`/activity/${ids.after}/after`, 'chimdi'),
  m(`/activity/${ids.complete}/recap`, 'chimdi'),
  m(`/activity/${ids.complete}/run-it-back`, 'chimdi'),
  m('/challenge/d1000000-0000-4000-8000-000000000001', 'chimdi', 'Call-Out pending'),
  m('/challenge/new', 'chimdi'),
  m('/event/d2000000-0000-4000-8000-000000000001', 'chimdi', 'buildup'),
  m('/event/d2000000-0000-4000-8000-000000000001/poster', 'chimdi'),
  m('/event/d2000000-0000-4000-8000-000000000005', 'chimdi', 'event live'),
  m('/event/d2000000-0000-4000-8000-000000000006', 'chimdi', 'verifying'),
  m('/event/d2000000-0000-4000-8000-000000000007', 'chimdi', 'result'),
  m('/rivalry/d0000000-0000-4000-8000-000000000001', 'chimdi'),
  m('/crew', 'chimdi'),
  m('/crew/new', 'chimdi'),
  m('/crew/join', 'chimdi'),
  m('/crew/c1000000-0000-4000-8000-000000000001', 'chimdi'),
  m('/crew/c1000000-0000-4000-8000-000000000001/chat', 'chimdi'),
  m('/clan/f1000000-0000-4000-8000-000000000001', 'chimdi'),
  m('/clash/f4000000-0000-4000-8000-000000000001', 'chimdi'),
  m('/create/plan', 'chimdi'),
  m('/place/b0000000-0000-4000-8000-000000000001', 'chimdi'),
  m('/pay', 'chimdi'),
  m(`/pay/program/${PROGRAM}`, 'chimdi'),
  m('/pay/return?checkout_id=00000000-0000-4000-8000-000000000000&result=cancel', 'chimdi'),
  m('/settings/area', 'chimdi'),
  m('/settings/blocked', 'chimdi'),
  m('/settings/notifications', 'chimdi'),
  m('/settings/privacy', 'chimdi'),
  m(`/host/${PROGRAM}`, 'ade', 'host home'),
  m(`/host/${PROGRAM}/series/c6000000-0000-4000-8000-000000000011`, 'ade'),
  m(`/host/${PROGRAM}/session/${ids.session}`, 'ade'),
  m(`/host/${PROGRAM}/session/${ids.beginners}/requests`, 'ade'),
  m(`/host/${PROGRAM}/people`, 'ade'),
  m(`/host/${PROGRAM}/payments`, 'ade'),
  m(`/host/${PROGRAM}/announce`, 'ade'),
  m(`/host/${PROGRAM}/insights`, 'ade'),
  m(`/host/${PROGRAM}/league/c7000000-0000-4000-8000-000000000001`, 'ade'),
  m('/no-such-route', 'chimdi', '+not-found'),
  { app: 'admin', path: '/', as: null, note: 'sign in' },
  a('/#/queue'),
  a('/#/appeals'),
  a('/#/people'),
  a(`/#/people/${PEOPLE.chimdi.id}`),
  a('/#/audit'),
  a('/#/places'),
  { app: 'admin', path: '/#/reports/', as: 'staff', note: 'first open report', report: true },
].filter((r) => (!ONLY || r.path.includes(ONLY)) && (!ONLY_APP || r.app === ONLY_APP));

// In-page checks ------------------------------------------------------------------------------------
// Runs in the page. Returns names, targets, headings and colour findings.
function domChecks() {
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'switch', 'radio', 'tab', 'menuitem', 'slider', 'combobox',
    'textbox', 'searchbox', 'spinbutton', 'option', 'menuitemcheckbox', 'menuitemradio',
  ]);
  const hidden = (el) => {
    for (let e = el; e; e = e.parentElement) {
      if (e.getAttribute('aria-hidden') === 'true' || e.inert) return true;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return true;
    }
    return false;
  };
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const label = el.getAttribute('aria-label');
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? '-'}] "${(label ?? text).slice(0, 50)}" ${Math.round(r.width)}×${Math.round(r.height)}`;
  };
  const name = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent?.trim()) return lab.textContent.trim();
    }
    if (el.closest('label')?.textContent?.trim()) return el.closest('label').textContent.trim();
    const alt = el.getAttribute('alt') || el.getAttribute('title');
    if (alt) return alt;
    if (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type) && el.value) return el.value;
    // Text content, skipping aria-hidden descendants; images with labels count.
    const parts = [];
    const walk = (n) => {
      if (n.nodeType === 3) parts.push(n.textContent);
      else if (n.nodeType === 1) {
        if (n.getAttribute('aria-hidden') === 'true') return;
        const l = n.getAttribute('aria-label');
        if (l && n !== el) { parts.push(l); return; }
        n.childNodes.forEach(walk);
      }
    };
    walk(el);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  const seen = new Set();
  const interactive = [];
  document
    .querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role], [tabindex]')
    .forEach((el) => {
      const role = el.getAttribute('role');
      const tab = el.getAttribute('tabindex');
      const native = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
      const isInteractive =
        (role && INTERACTIVE_ROLES.has(role)) || (native && !role) || (tab !== null && Number(tab) >= 0);
      if (!isInteractive || seen.has(el) || hidden(el)) return;
      if (el.disabled && el.tagName !== 'BUTTON') return;
      seen.add(el);
      interactive.push(el);
    });

  const names = [];
  const targets = [];
  const commits = [];
  for (const el of interactive) {
    const role = el.getAttribute('role');
    const native = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    const n = name(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (!n) names.push(`no name: ${describe(el)}`);
    else if (!role && !native) names.push(`focusable, no role: ${describe(el)}`);
    const isText = ['textbox', 'searchbox'].includes(role) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    // Inline links inside running text are exempt (WCAG 2.5.8); flag them separately.
    const inline = role === 'link' && getComputedStyle(el).display === 'inline';
    // The hit area is the element plus anything inside it that reaches past it (the web stand-in
    // for hitSlop: an absolutely placed transparent box, like the reference `::after` insets).
    let [hl, ht, hr, hb] = [r.left, r.top, r.right, r.bottom];
    el.querySelectorAll('*').forEach((c) => {
      if (getComputedStyle(c).position !== 'absolute') return;
      const cr = c.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) return;
      hl = Math.min(hl, cr.left); ht = Math.min(ht, cr.top); hr = Math.max(hr, cr.right); hb = Math.max(hb, cr.bottom);
    });
    const hw = hr - hl;
    const hh = hb - ht;
    const small = isText ? hh < 44 : hw < 43.5 || hh < 43.5;
    if (small) targets.push(`${inline ? 'inline ' : ''}${describe(el)}${hw !== r.width || hh !== r.height ? ` (hit ${Math.round(hw)}×${Math.round(hh)})` : ''}`);
    if (/^I['’]M DOWN$/i.test((el.innerText || '').trim()) && r.height < 55.5)
      commits.push(`I'M DOWN ${Math.round(r.width)}×${Math.round(r.height)}${n !== (el.innerText || '').trim() ? ` (label "${n.slice(0, 40)}")` : ''}`);
  }

  // Headings.
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')]
    .filter((h) => !hidden(h))
    .map((h) => {
      const level = /^H[1-6]$/.test(h.tagName) ? Number(h.tagName[1]) : Number(h.getAttribute('aria-level') ?? 2);
      return { level, text: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    });
  const headingIssues = [];
  if (headings.length === 0) headingIssues.push('no headings');
  else {
    const h1 = headings.filter((h) => h.level === 1).length;
    if (h1 === 0) headingIssues.push('no h1');
    if (h1 > 1) headingIssues.push(`${h1} h1s`);
    for (let i = 1; i < headings.length; i++)
      if (headings[i].level > headings[i - 1].level + 1)
        headingIssues.push(`skip h${headings[i - 1].level}→h${headings[i].level} at "${headings[i].text}"`);
  }

  // Possible colour-only status marks: small, no text, no name, not hidden, with a fill.
  const colour = [];
  document.querySelectorAll('div, span').forEach((el) => {
    if (el.children.length || (el.textContent ?? '').trim()) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.width > 16 || r.height > 16) return;
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;
    if (hidden(el) || el.getAttribute('aria-label') || el.closest('[role=img][aria-label]')) return;
    // A mark whose parent or grandparent carries words is paired with text: fine.
    const host = el.parentElement;
    const near = (host?.innerText || '').trim() || (host?.parentElement?.innerText || '').trim();
    if (near) return;
    colour.push(`${Math.round(r.width)}×${Math.round(r.height)} ${bg} radius ${s.borderRadius}`);
  });

  return { names, targets, commits, headings, headingIssues, colour, interactive: interactive.length };
}

// Runs in the page: watches style mutations and animations for `ms` under reduced motion.
async function motionCheck(ms) {
  const runs = new Map();
  const obs = new MutationObserver((list) => {
    const t = performance.now();
    for (const rec of list) {
      const el = rec.target;
      const before = rec.oldValue ?? '';
      const after = el.getAttribute('style') ?? '';
      if (!/transform|opacity|width|height|left|top/.test(after + before)) continue;
      const r = runs.get(el) ?? { first: t, last: t, count: 0, runs: [] };
      if (t - r.last > 60) {
        r.runs.push(r.last - r.first);
        r.first = t;
      }
      r.last = t;
      r.count++;
      runs.set(el, r);
    }
  });
  obs.observe(document.body, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true });
  const anims = new Map();
  const start = performance.now();
  while (performance.now() - start < ms) {
    for (const an of document.getAnimations()) {
      const t = an.effect?.getTiming?.() ?? {};
      const d = typeof t.duration === 'number' ? t.duration : 0;
      const it = t.iterations ?? 1;
      if (d > 120 || it === Infinity) {
        const target = an.effect?.target;
        const key = `${an.constructor.name} ${an.animationName ?? an.transitionProperty ?? ''} ${Math.round(d)}ms × ${it} on ${target?.tagName?.toLowerCase() ?? '?'}[${target?.getAttribute?.('aria-label') ?? target?.getAttribute?.('role') ?? ''}]`;
        anims.set(key, true);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  obs.disconnect();
  const jsRuns = [];
  for (const [el, r] of runs) {
    r.runs.push(r.last - r.first);
    const longest = Math.max(...r.runs);
    if (longest > 150 && r.count > 4) {
      jsRuns.push(
        `style animated ${Math.round(longest)}ms (${r.count} frames) on ${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.getAttribute('role') ?? (el.className?.toString?.() ?? '').slice(0, 30)}]`,
      );
    }
  }
  // Long transitions declared in CSS (would run on the next state change).
  const transitions = new Set();
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.transitionDuration && s.transitionDuration !== '0s') {
      const longest = Math.max(...s.transitionDuration.split(',').map((v) => parseFloat(v) * (v.includes('ms') ? 1 : 1000)));
      if (longest > 120) transitions.add(`transition ${longest}ms (${s.transitionProperty}) on ${el.tagName.toLowerCase()}`);
    }
  });
  return { animations: [...anims.keys()], jsRuns, transitions: [...transitions].slice(0, 10) };
}

// Runs in the page: scales every text style as native font scale 200% would (display type capped at
// 1.3×, as the design-system Text does), then finds clipped, overlapping and truncated text.
async function largeTextCheck() {
  const leaves = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    leaves.push(el);
  });
  // Native caps (design-system Text): display type scales to 1.3× at most; avatar initials and
  // count badges don't scale. Body and UI text scale to 2×.
  const sizes = leaves.map((el) => {
    const s = getComputedStyle(el);
    const factor = el.closest('[role=img]') ? 1 : /anton|druk/i.test(s.fontFamily) ? 1.3 : 2;
    return [parseFloat(s.fontSize), s.lineHeight === 'normal' ? null : parseFloat(s.lineHeight), factor];
  });
  leaves.forEach((el, i) => {
    const [fs, lh, factor] = sizes[i];
    el.style.fontSize = `${fs * factor}px`;
    if (lh) el.style.lineHeight = `${lh * factor}px`;
  });
  await new Promise((r) => setTimeout(r, 600));
  const vis = (el) => {
    for (let e = el; e; e = e.parentElement) {
      if (e.getAttribute('aria-hidden') === 'true') return false;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return true;
  };
  const textRect = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  };
  const label = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const clipped = [];
  const truncated = [];
  const boxes = [];
  for (const el of leaves) {
    if (!vis(el)) continue;
    const r = textRect(el);
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) truncated.push(`"${label(el)}"`);
      boxes.push({ el, r: el.getBoundingClientRect() });
      continue;
    }
    boxes.push({ el, r });
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      const ox = ps.overflowX;
      const oy = ps.overflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      const pr = p.getBoundingClientRect();
      const cutX = ox !== 'visible' && ox !== 'auto' && ox !== 'scroll' && (r.left < pr.left - 1 || r.right > pr.right + 1);
      const cutY = oy !== 'visible' && oy !== 'auto' && oy !== 'scroll' && (r.top < pr.top - 1 || r.bottom > pr.bottom + 1);
      if (cutX || cutY) {
        clipped.push(`"${label(el)}" ${cutX ? 'x' : ''}${cutY ? 'y' : ''} by ${p.tagName.toLowerCase()}[${p.getAttribute('role') ?? ''}] ${Math.round(pr.width)}×${Math.round(pr.height)}`);
        break;
      }
      if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') break;
    }
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i];
      const B = boxes[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w > 4 && h > 4) {
        // Ignore layers stacked on purpose (one fully transparent or behind a sheet).
        const ta = getComputedStyle(A.el).position;
        const tb = getComputedStyle(B.el).position;
        if (ta === 'fixed' || tb === 'fixed') continue;
        overlaps.push(`"${label(A.el)}" × "${label(B.el)}" (${Math.round(w)}×${Math.round(h)})`);
        if (overlaps.length > 40) break;
      }
    }
  }
  return { clipped, truncated, overlaps, horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
}

// Driver ----------------------------------------------------------------------------------------------
async function settle(page) {
  const until = Date.now() + 12_000;
  await page.waitForLoadState('load').catch(() => {});
  await sleep(1200);
  while (Date.now() < until) {
    const busy = await page
      .evaluate(() => document.querySelectorAll('[aria-busy=true], [aria-label*="Loading" i]').length)
      .catch(() => 0);
    if (!busy) break;
    await sleep(400);
  }
  await sleep(800);
}

async function gotoWithRetry(page, url) {
  for (let i = 0; i < 4; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      return true;
    } catch {
      await sleep(10_000); // the shared dev server restarts itself under memory pressure
    }
  }
  return false;
}

const slug = (r) => `${r.app}${r.path}`.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '').slice(0, 80);

async function auditRoute(browser, route, sessions) {
  const session = route.as ? sessions[route.as] : null;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: 'reduce',
    storageState: storageState(session, route.app),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  const base = route.app === 'admin' ? ADMIN : APP;
  let url = `${base}${route.path}`;
  const result = { app: route.app, path: route.path, as: route.as, note: route.note ?? '' };
  try {
    if (!(await gotoWithRetry(page, url))) throw new Error('page did not load');
    await settle(page);
    if (route.report) {
      const href = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="#/reports/"]')].map((x) => x.getAttribute('href'))[0],
      );
      if (href) {
        url = new URL(href, `${ADMIN}/`).toString();
        await page.goto(url);
        await settle(page);
      }
    }
    result.finalUrl = page.url().replace(base, '');
    await page.addScriptTag({ path: AXE_PATH });
    const axe = await page.evaluate(async () => {
      const res = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        resultTypes: ['violations'],
      });
      return res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
        targets: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} ${(n.failureSummary ?? '').split('\n')[1]?.trim() ?? ''}`.slice(0, 200)),
      }));
    });
    result.axe = axe;
    Object.assign(result, await page.evaluate(domChecks));
    result.motion = await page.evaluate(motionCheck, 2500);
    await page.screenshot({ path: join(OUT, 'shots', `${slug(route)}.png`), fullPage: false });
    result.text200 = await page.evaluate(largeTextCheck);
    await page.screenshot({ path: join(OUT, 'shots', `${slug(route)}@200.png`), fullPage: true });
  } catch (e) {
    result.error = String(e.message ?? e).slice(0, 200);
  }
  result.pageErrors = errors;
  await context.close();
  return result;
}

function summarize(r) {
  if (r.error) return { route: `${r.app} ${r.path}`, error: r.error };
  const axeSerious = r.axe.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return {
    route: `${r.app === 'admin' ? 'admin ' : ''}${r.path.length > 58 ? `${r.path.slice(0, 55)}…` : r.path}`,
    axe: `${r.axe.length}${axeSerious.length ? ` (${axeSerious.length}!)` : ''}`,
    names: r.names.length,
    targets: r.targets.length,
    commit: r.commits.length,
    headings: r.headingIssues.length ? r.headingIssues.join('; ').slice(0, 30) : 'ok',
    colour: r.colour.length,
    motion: r.motion.animations.length + r.motion.jsRuns.length,
    clip200: r.text200.clipped.length,
    overlap200: r.text200.overlaps.length,
    trunc200: r.text200.truncated.length,
  };
}

function table(rows) {
  const cols = ['route', 'axe', 'names', 'targets', 'commit', 'headings', 'colour', 'motion', 'clip200', 'overlap200', 'trunc200'];
  const lines = [
    `| ${cols.join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
    ...rows.map((s) => (s.error ? `| ${s.route} | ERROR: ${s.error} |` : `| ${cols.map((c) => String(s[c])).join(' | ')} |`)),
  ];
  return lines.join('\n');
}

function details(results) {
  const out = [];
  for (const r of results) {
    out.push(`\n## ${r.app} ${r.path}${r.note ? ` (${r.note})` : ''}${r.as ? ` as ${r.as}` : ''}`);
    if (r.finalUrl && r.finalUrl !== r.path) out.push(`Landed on \`${r.finalUrl}\``);
    if (r.error) {
      out.push(`ERROR ${r.error}`);
      continue;
    }
    const list = (title, items) => {
      if (items?.length) out.push(`**${title}** (${items.length})\n${items.slice(0, 25).map((i) => `- ${i}`).join('\n')}`);
    };
    list('axe', r.axe.map((v) => `${v.id} [${v.impact}] ×${v.nodes}: ${v.help}\n${v.targets.map((t) => `  - \`${t}\``).join('\n')}`));
    list('Names / roles', r.names);
    list('Targets under 44', r.targets);
    list('Commit under 56', r.commits);
    list('Headings', r.headingIssues);
    out.push(`Heading outline: ${r.headings.map((h) => `h${h.level} ${h.text}`).join(' · ') || '(none)'}`);
    list('Possible colour-only marks', r.colour);
    list('Motion under reduced motion', [...r.motion.animations, ...r.motion.jsRuns]);
    list('Declared transitions over 120ms', r.motion.transitions);
    list('Clipped at 200%', r.text200.clipped);
    list('Overlapping at 200%', r.text200.overlaps);
    list('Truncated at 200%', r.text200.truncated);
    if (r.text200.horizontalScroll) out.push('**Horizontal scroll at 200%**');
    list('Page errors', r.pageErrors);
  }
  return out.join('\n');
}

const main = async () => {
  const sessions = {};
  for (const [k, p] of Object.entries(PEOPLE)) {
    if (!ROUTES.some((r) => r.as === k)) continue;
    sessions[k] = await signIn(p.phone);
  }
  const browser = await chromium.launch();
  const results = [];
  for (const route of ROUTES) {
    const t = Date.now();
    const r = await auditRoute(browser, route, sessions);
    results.push(r);
    const s = summarize(r);
    console.error(`${((Date.now() - t) / 1000).toFixed(1)}s ${s.route} ${s.error ?? ''}`);
  }
  await browser.close();
  const rows = results.map(summarize);
  const md = `# Ojoro accessibility audit\n\n${new Date().toISOString()} · ${VIEWPORT.width}×${VIEWPORT.height} · reduced motion · text at 2×\n\nids: ${JSON.stringify(ids)}\n\n${table(rows)}\n${details(results)}\n`;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ids, results }, null, 2));
  writeFileSync(join(OUT, 'report.md'), md);
  console.log(table(rows));
  console.log(`\nDetails: ${join(OUT, 'report.md')}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
