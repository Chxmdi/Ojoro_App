/* @ds-bundle: {"format":4,"namespace":"Ojoro","components":[{"name":"Button"},{"name":"DisplayText"},{"name":"Icon"},{"name":"IconButton"},{"name":"Avatar"},{"name":"Badge"},{"name":"Chip"},{"name":"Input"},{"name":"Progress"},{"name":"Divider"},{"name":"Image"},{"name":"Sheet"},{"name":"Modal"},{"name":"Toast"},{"name":"Skeleton"},{"name":"AvatarCluster"},{"name":"ParticipantRow"},{"name":"UserMiniCard"},{"name":"PlaceMiniCard"},{"name":"VerificationBadge"},{"name":"ReactionBar"},{"name":"Comment"},{"name":"Poll"},{"name":"LiveIndicator"},{"name":"Countdown"},{"name":"PredictionBar"},{"name":"CrowdSupport"},{"name":"MomentumMeter"},{"name":"CrewMomentum"},{"name":"DownFor"},{"name":"PlanForming"},{"name":"GameOnPoster"},{"name":"ActivityObject"},{"name":"ActivityStrip"},{"name":"RunItBack"},{"name":"CallOutPoster"},{"name":"ChallengeEventHero"},{"name":"LiveChallenge"},{"name":"HypePost"},{"name":"RecapPoster"},{"name":"Rivalry"},{"name":"Rematch"},{"name":"PassportStamp"},{"name":"Graphic"}]} */
(function () {
  var React = window.React, h = React.createElement, F = React.Fragment;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function word(n) { return WORDS[n] || String(n); }
  function initials(name) { return String(name || '?').split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase(); }

  /* ---------- Graphic language ---------- */
  function Graphic(p) {
    var kind = p.kind || 'o', size = p.size || 48, sw = p.strokeWidth || 3;
    var paths = {
      o: h('circle', { cx: 24, cy: 24, r: 20, fill: 'none', stroke: 'currentColor', strokeWidth: sw }),
      trail: h('path', { d: 'M3 38 C 12 36, 10 20, 20 22 S 30 34, 36 24 S 40 8, 45 6', fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeDasharray: '1 0' }),
      mark: h('path', { d: 'M14 44 L34 4', stroke: 'currentColor', strokeWidth: sw * 2, strokeLinecap: 'square' }),
      'scribble-circle': h('path', { d: 'M40 14 C 34 5, 12 4, 6 16 C 0 30, 14 44, 28 42 C 42 40, 46 26, 38 14 C 34 8, 26 6, 20 8', fill: 'none', stroke: 'currentColor', strokeWidth: sw * 0.7, strokeLinecap: 'round' }),
      underline: h('path', { d: 'M3 30 C 14 26, 30 25, 45 27 M8 35 C 20 32, 32 32, 42 33', fill: 'none', stroke: 'currentColor', strokeWidth: sw * 0.7, strokeLinecap: 'round' }),
      arrow: h('path', { d: 'M4 34 C 14 20, 26 16, 40 16 M32 9 L41 16 L33 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw * 0.7, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      crown: h('path', { d: 'M6 34 L10 14 L18 26 L24 10 L30 26 L38 14 L42 34 Z', fill: 'none', stroke: 'currentColor', strokeWidth: sw * 0.7, strokeLinejoin: 'round' })
    };
    return h('svg', { className: cx('oj-graphic', p.className), width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': p.label ? undefined : true, role: p.label ? 'img' : undefined, 'aria-label': p.label }, paths[kind] || paths.o);
  }

  function Check() { return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M3 8.5 L6.5 12 L13 4.5', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'square' })); }

  /* ---------- Primitives ---------- */
  function Button(p) {
    var variant = p.variant || 'primary', rest = {};
    for (var k in p) if (['variant', 'committed', 'block', 'className', 'children'].indexOf(k) < 0) rest[k] = p[k];
    var label = p.children;
    if (variant === 'commit') label = p.committed ? h(F, null, h(Check), "YOU'RE DOWN") : (p.children || "I'M DOWN");
    return h('button', Object.assign({ type: 'button', 'aria-pressed': variant === 'commit' ? !!p.committed : undefined }, rest, {
      className: cx('oj-btn', 'oj-btn-' + variant, p.committed && 'is-committed', p.block && 'oj-btn-block', p.className)
    }), label);
  }

  function DisplayText(p) {
    return h(p.as || 'h2', { className: cx('oj-display', 'oj-display-' + (p.size || 'lg'), p.muted && 'is-muted', p.className) }, p.children);
  }

  function Avatar(p) {
    var size = p.size || 'md';
    return h('span', { className: cx('oj-avatar', 'oj-avatar-' + size, p.empty && 'is-empty', p.className), role: 'img', 'aria-label': p.empty ? 'Open spot' : p.name },
      p.empty ? null : p.src ? h('img', { src: p.src, alt: '' }) : initials(p.name));
  }

  function Badge(p) {
    var tone = p.tone || 'neutral';
    return h('span', { className: cx('oj-badge', 'oj-badge-' + tone, p.className) },
      tone === 'verified' ? h(Check) : null, p.children);
  }

  function Chip(p) {
    return h('button', { type: 'button', className: cx('oj-chip', p.selected && 'is-selected'), 'aria-pressed': !!p.selected, onClick: p.onClick }, p.selected ? h(Check) : null, p.children);
  }

  function Progress(p) {
    var max = p.max || 8, val = Math.min(p.value || 0, max), segs = [];
    for (var i = 0; i < max; i++) segs.push(h('span', { key: i, className: cx('oj-seg', i < val && 'is-on') }));
    return h('div', { className: cx('oj-progress', p.className), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': val, 'aria-label': p.label || (val + ' of ' + max) }, segs);
  }

  /* ---------- Social ---------- */
  function AvatarCluster(p) {
    var people = p.people || [], max = p.max || 5, shown = people.slice(0, max), extra = (p.total || people.length) - shown.length, open = p.open || 0, kids = [];
    shown.forEach(function (x, i) { kids.push(h(Avatar, { key: 'p' + i, name: x.name, src: x.src, size: p.size || 'sm', className: x.isNew ? 'is-new' : null })); });
    if (extra > 0) kids.push(h('span', { key: 'x', className: cx('oj-avatar', 'oj-avatar-' + (p.size || 'sm'), 'oj-avatar-more') }, '+' + extra));
    for (var j = 0; j < open; j++) kids.push(h(Avatar, { key: 'o' + j, empty: true, size: p.size || 'sm' }));
    return h('div', { className: 'oj-cluster', role: 'group', 'aria-label': (p.total || people.length) + ' people in' + (open ? ', ' + open + ' open' : '') }, kids);
  }

  function LiveIndicator(p) {
    return h('span', { className: cx('oj-live', p.className), role: 'status' }, h('span', { className: 'oj-live-dot', 'aria-hidden': true }), p.label || 'LIVE');
  }

  function Countdown(p) {
    var parts = [['days', 'DAYS'], ['hours', 'HRS'], ['minutes', 'MIN']];
    if (p.seconds != null) parts.push(['seconds', 'SEC']);
    var shown = parts.filter(function (x) { return p[x[0]] != null; });
    return h('div', { className: cx('oj-countdown', p.className), role: 'timer', 'aria-label': (p.label ? p.label + ': ' : '') + shown.map(function (x) { return p[x[0]] + ' ' + x[0]; }).join(', ') },
      p.label ? h('div', { className: 'oj-overline' }, p.label) : null,
      h('div', { className: 'oj-countdown-row' }, shown.map(function (x) {
        return h('div', { key: x[0], className: 'oj-countdown-unit' }, h('span', { className: 'oj-display oj-display-lg' }, String(p[x[0]]).padStart(2, '0')), h('span', { className: 'oj-label-sm' }, x[1]));
      })));
  }

  function PredictionBar(p) {
    var a = p.a, b = p.b, total = (a.pct + b.pct) || 1, ap = Math.round(a.pct / total * 100), bp = 100 - ap;
    return h('section', { className: 'oj-predict', 'aria-label': (p.question || 'Who takes it?') + ' ' + a.name + ' ' + ap + ' percent, ' + b.name + ' ' + bp + ' percent' },
      h('div', { className: 'oj-display oj-display-sm' }, p.question || 'WHO TAKES IT?'),
      h('div', { className: 'oj-predict-names' },
        h('div', null, h('span', { className: 'oj-label' }, a.name), h('span', { className: 'oj-display oj-display-sm' }, ap + '%'), p.picked === 'a' ? h(Badge, { tone: 'signal' }, 'YOUR PICK') : null),
        h('div', { className: 'oj-right' }, p.picked === 'b' ? h(Badge, { tone: 'signal' }, 'YOUR PICK') : null, h('span', { className: 'oj-display oj-display-sm' }, bp + '%'), h('span', { className: 'oj-label' }, b.name))),
      h('div', { className: 'oj-predict-bar', 'aria-hidden': true }, h('span', { className: 'oj-predict-a', style: { flexBasis: ap + '%' } }), h('span', { className: 'oj-predict-b', style: { flexBasis: bp + '%' } })));
  }

  function CrowdSupport(p) {
    function side(s, key) {
      return h('div', { className: 'oj-crowd-side', key: key },
        h('div', { className: 'oj-display oj-display-lg' }, String(s.count)),
        h('div', { className: 'oj-label' }, 'BACK ' + s.name),
        h(Button, { variant: p.backing === key ? 'primary' : 'secondary', 'aria-pressed': p.backing === key, onClick: p.onBack ? function () { p.onBack(key); } : undefined }, p.backing === key ? 'BACKING' : 'BACK ' + s.name));
    }
    return h('section', { className: 'oj-crowd', 'aria-label': 'The crowd' },
      h('div', { className: 'oj-overline' }, 'THE CROWD'),
      h('div', { className: 'oj-crowd-row' }, side(p.a, 'a'), h('div', { className: 'oj-crowd-vs oj-display oj-display-sm', 'aria-hidden': true }, '/'), side(p.b, 'b')));
  }

  function MomentumMeter(p) {
    var w = p.weeks || [], max = Math.max.apply(null, w.concat([1]));
    return h('section', { className: 'oj-momentum', 'aria-label': (p.label || 'Momentum') + ': ' + w[w.length - 1] + ' sessions this week, ' + w.length + ' week history' },
      h('div', { className: 'oj-momentum-head' }, h('span', { className: 'oj-overline' }, p.label || 'MOMENTUM'), h('span', { className: 'oj-display oj-display-xs' }, (p.streak || 0) + ' WEEK STREAK')),
      h('div', { className: 'oj-momentum-bars', 'aria-hidden': true }, w.map(function (n, i) {
        return h('span', { key: i, className: cx('oj-bar', i === w.length - 1 && 'is-now'), style: { height: Math.max(6, n / max * 56) + 'px' } });
      })));
  }

  /* ---------- Movement ---------- */
  function DownFor(p) {
    var n = p.downCount || 0;
    return h('article', { className: 'oj-downfor', 'aria-label': p.activity + ' ' + p.when + '. ' + n + ' people down.' },
      h('div', { className: 'oj-overline' }, 'DOWN FOR'),
      h('h3', { className: 'oj-display oj-display-xl' }, (p.activity + ' ' + p.when + '?').toUpperCase()),
      h('p', { className: 'oj-body oj-muted' }, p.where),
      h('div', { className: 'oj-downfor-foot' },
        h(AvatarCluster, { people: p.downs || [], total: n }),
        h('span', { className: 'oj-caption oj-muted' }, n + ' down')),
      h(Button, { variant: 'commit', block: true, committed: p.committed, onClick: p.onDown }));
  }

  function planVariant(c, cap, expired) {
    if (expired) return 'expired';
    if (c >= cap) return 'game-on';
    if (cap - c === 1) return 'need-one-more';
    if (c / cap >= 0.75) return 'almost';
    if (c / cap >= 0.5) return 'viable';
    return 'early';
  }

  function PlanForming(p) {
    var c = p.count, cap = p.capacity, v = p.variant || planVariant(c, cap, p.expired), left = Math.max(0, cap - c);
    var theme = v === 'game-on' ? 'confirmed' : v === 'expired' ? 'calm' : 'forming';
    var head = v === 'game-on' ? 'GAME ON' : v === 'need-one-more' ? 'NEED ONE MORE' : v === 'expired' ? 'EXPIRED' : left + ' MORE';
    var sr = p.activity + ' plan ' + (v === 'game-on' ? 'confirmed. Game on.' : v === 'expired' ? 'expired.' : 'forming.') + ' ' + word(c) + ' of ' + word(cap) + ' participants committed.' + (left && v !== 'expired' ? ' ' + word(left) + ' more participant' + (left > 1 ? 's' : '') + ' needed.' : '');
    return h('article', { className: cx('oj-plan', 'oj-plan-' + v), 'data-theme': theme, 'aria-label': sr },
      h('div', { className: 'oj-plan-top' }, h('span', { className: 'oj-overline' }, v === 'game-on' ? 'CONFIRMED' : v === 'expired' ? 'PLAN' : 'PLAN FORMING'), h('span', { className: 'oj-body-sm oj-muted' }, p.activity + ' · ' + p.time)),
      h('div', { className: 'oj-plan-count' }, h('span', { className: 'oj-display oj-display-lg' }, c + ' / ' + cap), h('span', { className: cx('oj-display', v === 'game-on' || v === 'need-one-more' ? 'oj-display-md' : 'oj-display-sm', 'oj-plan-head') }, head)),
      h(Progress, { value: c, max: cap, label: c + ' of ' + cap + ' committed' }),
      h('div', { className: 'oj-plan-people' }, h(AvatarCluster, { people: p.participants || [], total: c, max: 6, open: v === 'game-on' || v === 'expired' ? 0 : Math.min(left, 2) }), h('span', { className: 'oj-body-sm oj-muted' }, p.place)),
      v === 'need-one-more' ? h(Button, { variant: 'primary', block: true, onClick: p.onInvite }, 'PULL SOMEONE IN')
        : v === 'game-on' ? h(Button, { variant: 'primary', block: true, onClick: p.onOpen }, 'OPEN GAME')
          : v === 'expired' ? null
            : h(Button, { variant: 'commit', block: true, committed: p.joined, onClick: p.onJoin }));
  }

  function GameOnPoster(p) {
    return h('article', { className: 'oj-poster oj-gameon', 'data-theme': 'confirmed', 'aria-label': 'Game on. ' + p.activity + ', ' + p.time + ', ' + p.place + '.' },
      h('div', { className: 'oj-overline' }, 'CONFIRMED · ' + (p.count || '') + ' IN'),
      h('h3', { className: 'oj-display oj-display-hero' }, 'GAME', h('br'), 'ON'),
      h('div', { className: 'oj-poster-meta' },
        h('div', null, h('div', { className: 'oj-label oj-muted' }, 'WHAT'), h('div', { className: 'oj-title' }, p.activity)),
        h('div', null, h('div', { className: 'oj-label oj-muted' }, 'WHEN'), h('div', { className: 'oj-title' }, p.time)),
        h('div', null, h('div', { className: 'oj-label oj-muted' }, 'WHERE'), h('div', { className: 'oj-title' }, p.place))),
      p.people ? h(AvatarCluster, { people: p.people, total: p.count, max: 8 }) : null);
  }

  function ActivityStrip(p) {
    var status = p.status || 'forming';
    var tag = status === 'live' ? h(LiveIndicator) : status === 'confirmed' ? h(Badge, { tone: 'signal' }, 'GAME ON') : status === 'full' ? h(Badge, null, 'FULL') : h(Badge, null, p.count + ' / ' + p.capacity);
    return h('a', { href: p.href || '#', className: 'oj-strip', 'aria-label': p.activity + ', ' + p.time + ', ' + p.place + ', ' + status },
      h('span', { className: 'oj-strip-time oj-display oj-display-xs' }, p.time),
      h('span', { className: 'oj-strip-body' }, h('span', { className: 'oj-title' }, p.activity), h('span', { className: 'oj-body-sm oj-muted' }, p.place)),
      tag);
  }

  /* ---------- Competition ---------- */
  function CallOutPoster(p) {
    var a = p.challenger, b = p.opponent;
    return h('article', { className: 'oj-poster oj-callout', 'data-theme': 'live', 'aria-label': 'Call-out. ' + a.name + ' versus ' + b.name + ', ' + p.discipline + '. ' + (p.status || 'Pending') + '.' },
      h('div', { className: 'oj-callout-top' }, h('span', { className: 'oj-overline' }, 'CALL-OUT'), h(Badge, { tone: p.status === 'ACCEPTED' ? 'signal' : 'neutral' }, p.status || 'PENDING')),
      h('div', { className: 'oj-callout-names' },
        h('div', { className: 'oj-display oj-display-xl' }, a.name.toUpperCase()),
        h('div', { className: 'oj-callout-vs' }, h('span', { className: 'oj-callout-rule', 'aria-hidden': true }), h('span', { className: 'oj-display oj-display-sm' }, 'VS'), h('span', { className: 'oj-callout-rule', 'aria-hidden': true })),
        h('div', { className: 'oj-display oj-display-xl oj-right' }, b.name.toUpperCase())),
      h('div', { className: 'oj-callout-foot' }, h('span', { className: 'oj-display oj-display-md' }, p.discipline), p.when ? h('span', { className: 'oj-body-sm oj-muted' }, p.when) : null),
      p.actions ? h('div', { className: 'oj-row' }, h(Button, { variant: 'primary', onClick: p.onAccept }, 'ACCEPT'), h(Button, { variant: 'secondary', onClick: p.onCounter }, 'COUNTER'), h(Button, { variant: 'ghost', onClick: p.onPass }, 'PASS')) : null);
  }

  var STAGES = {
    accepted: { theme: 'forming', head: null, over: 'CHALLENGE ACCEPTED' },
    days: { theme: 'forming', head: null, over: 'CHALLENGE EVENT' },
    today: { theme: 'confirmed', head: 'TODAY.', over: 'CHALLENGE DAY' },
    soon: { theme: 'confirmed', head: 'ALMOST TIME.', over: 'CHECK-IN OPEN' },
    live: { theme: 'live', head: null, over: null },
    complete: { theme: 'after', head: null, over: 'RESULT · VERIFIED' }
  };
  function ChallengeEventHero(p) {
    var s = STAGES[p.stage || 'accepted'], a = p.a, b = p.b;
    var names = h('div', { className: 'oj-hero-names' },
      h('div', { className: 'oj-display oj-display-xl' }, a.name.toUpperCase()),
      h('div', { className: 'oj-display oj-display-sm oj-muted' }, 'VS'),
      h('div', { className: 'oj-display oj-display-xl' }, b.name.toUpperCase()));
    var body;
    if (p.stage === 'complete') {
      body = h(F, null, h('div', { className: 'oj-display oj-display-hero' }, (p.winner || a.name).toUpperCase() + ' WINS.'), h('div', { className: 'oj-numeric' }, p.result || ''));
    } else if (p.stage === 'live') {
      body = h(F, null, h('div', { className: 'oj-row' }, h(LiveIndicator), h('span', { className: 'oj-body-sm oj-muted' }, p.discipline)), names,
        h('div', { className: 'oj-hero-live' }, h('div', null, h('div', { className: 'oj-display oj-display-lg' }, a.progress), h('div', { className: 'oj-label oj-muted' }, a.name)), h('div', { className: 'oj-right' }, h('div', { className: 'oj-display oj-display-lg' }, b.progress), h('div', { className: 'oj-label oj-muted' }, b.name))));
    } else {
      body = h(F, null, s.head ? h('div', { className: 'oj-display oj-display-hero' }, s.head) : null, names,
        h('div', { className: 'oj-hero-foot' }, h('span', { className: 'oj-display oj-display-sm' }, p.discipline),
          p.stage === 'days' || p.stage === 'accepted' ? h(Countdown, p.countdown || {}) : h('span', { className: 'oj-body-sm oj-muted' }, p.when)));
    }
    return h('header', { className: cx('oj-poster', 'oj-hero', 'oj-hero-' + (p.stage || 'accepted')), 'data-theme': s.theme, 'aria-label': 'Challenge event, ' + a.name + ' versus ' + b.name + ', ' + (p.stage || 'accepted') },
      s.over ? h('div', { className: 'oj-overline' }, s.over) : null, body);
  }

  var POST_KIND = { competitor: 'COMPETITOR', system: 'OJORO', supporter: 'SUPPORTER', evidence: 'TRAINING' };
  function HypePost(p) {
    var kind = p.kind || 'supporter';
    if (kind === 'system') return h('div', { className: 'oj-post oj-post-system', role: 'article' }, h('span', { className: 'oj-overline' }, 'UPDATE · ' + (p.time || '')), h('div', { className: 'oj-display oj-display-sm' }, p.body));
    return h('article', { className: cx('oj-post', 'oj-post-' + kind) },
      h(Avatar, { name: p.author, size: kind === 'competitor' ? 'md' : 'sm' }),
      h('div', { className: 'oj-post-main' },
        h('div', { className: 'oj-post-head' }, h('span', { className: 'oj-title-sm' }, p.author), h(Badge, { tone: kind === 'competitor' ? 'signal' : 'neutral' }, POST_KIND[kind] + (p.side ? ' · ' + p.side : '')), h('span', { className: 'oj-caption oj-muted' }, p.time)),
        h('p', { className: 'oj-body' }, p.body),
        kind === 'evidence' && p.stats ? h('div', { className: 'oj-post-stats' }, p.stats.map(function (st, i) { return h('div', { key: i }, h('div', { className: 'oj-display oj-display-xs' }, st.value), h('div', { className: 'oj-caption oj-muted' }, st.label)); })) : null));
  }

  function RecapPoster(p) {
    return h('article', { className: 'oj-poster oj-recap', 'data-theme': 'after', 'aria-label': p.winner + ' wins. ' + p.discipline + '. ' + (p.result || '') },
      h('div', { className: 'oj-recap-top' }, h('span', { className: 'oj-overline' }, 'RECAP · ' + (p.date || '')), h(Badge, { tone: 'verified' }, 'VERIFIED')),
      h('div', { className: 'oj-recap-head' }, h(Graphic, { kind: 'crown', size: 40, className: 'oj-signal-ink' }), h('h3', { className: 'oj-display oj-display-hero' }, p.winner.toUpperCase() + ' WINS.')),
      h('div', { className: 'oj-recap-stats' }, (p.stats || []).map(function (st, i) { return h('div', { key: i }, h('div', { className: 'oj-display oj-display-sm' }, st.value), h('div', { className: 'oj-label oj-muted' }, st.label)); })),
      h('p', { className: 'oj-body' }, p.story),
      h('div', { className: 'oj-row' }, h(Button, { variant: 'primary' }, 'RUN IT BACK'), h(Button, { variant: 'secondary' }, 'SHARE RECAP')));
  }

  /* ---------- Identity ---------- */
  function PassportStamp(p) {
    return h('figure', { className: cx('oj-stamp', p.tilt === false && 'is-flat'), 'aria-label': p.title + ', ' + p.place + ', ' + p.date },
      h('div', { className: 'oj-stamp-ring' },
        h('span', { className: 'oj-label-sm' }, p.kind || 'OJORO PASSPORT'),
        h('span', { className: 'oj-display oj-display-xs' }, p.title),
        h('span', { className: 'oj-stamp-rule', 'aria-hidden': true }),
        h('span', { className: 'oj-label-sm' }, p.place),
        h('span', { className: 'oj-caption' }, p.date)));
  }

  /* ---------- Iconography: 24 grid, 2px stroke, square caps, currentColor ---------- */
  var ICONS = {
    close: 'M6 6 L18 18 M18 6 L6 18',
    back: 'M15 5 L8 12 L15 19',
    forward: 'M9 5 L16 12 L9 19',
    plus: 'M12 5 V19 M5 12 H19',
    more: 'M5 12 h.01 M12 12 h.01 M19 12 h.01',
    share: 'M12 15 V4 M7 9 L12 4 L17 9 M5 13 V20 H19 V13',
    bell: 'M6 16 V11 a6 6 0 0 1 12 0 V16 L20 18 H4 Z M10 21 H14',
    chat: 'M4 5 H20 V16 H11 L6 20 V16 H4 Z',
    pin: 'M12 21 C 7 15, 5 12, 5 9 a7 7 0 0 1 14 0 C 19 12, 17 15, 12 21 Z M12 9 h.01',
    clock: 'M12 7 V12 L15 14 M12 3 a9 9 0 1 0 0.01 0',
    check: 'M5 12.5 L10 17.5 L19 7',
    alert: 'M12 7 V13 M12 17 h.01 M12 3 a9 9 0 1 0 0.01 0',
    offline: 'M3 3 L21 21 M8.5 16.5 a5 5 0 0 1 7 0 M5 12.5 a10 10 0 0 1 4 -2.5 M19 12.5 a10 10 0 0 0 -3 -2 M12 20 h.01',
    lights: 'M12 2 V5 M4.5 5.5 L6.5 7.5 M19.5 5.5 L17.5 7.5 M7 14 a5 5 0 1 1 10 0 V17 H7 Z M9 21 H15',
    search: 'M10.5 4 a6.5 6.5 0 1 0 0.01 0 M15.5 15.5 L20 20',
    people: 'M9 11 a3.5 3.5 0 1 0 0.01 0 M3 20 C 3 16, 6 14.5, 9 14.5 S 15 16, 15 20 M16 4.5 a3.5 3.5 0 0 1 0 7 M17.5 14.5 C 19.5 15, 21 16.5, 21 20'
  };
  function Icon(p) {
    var size = p.size || 24;
    return h('svg', { className: cx('oj-icon', p.className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.strokeWidth || 2, strokeLinecap: 'square', strokeLinejoin: 'miter', 'aria-hidden': p.label ? undefined : true, role: p.label ? 'img' : undefined, 'aria-label': p.label },
      h('path', { d: ICONS[p.name] || ICONS.more }));
  }

  /* ---------- More primitives ---------- */
  function IconButton(p) {
    return h('button', { type: 'button', className: cx('oj-iconbtn', 'oj-iconbtn-' + (p.variant || 'plain'), p.className), 'aria-label': p.label, title: p.label, onClick: p.onClick, disabled: p.disabled },
      h(Icon, { name: p.icon }), p.count ? h('span', { className: 'oj-iconbtn-count', 'aria-hidden': true }, p.count > 9 ? '9+' : p.count) : null);
  }

  var uid = 0;
  function Input(p) {
    var idRef = React.useRef(null); if (!idRef.current) idRef.current = 'oj-in-' + (++uid);
    var id = p.id || idRef.current, hintId = id + '-hint', rest = {};
    for (var k in p) if (['label', 'hint', 'error', 'multiline', 'className', 'id', 'icon'].indexOf(k) < 0) rest[k] = p[k];
    var field = h(p.multiline ? 'textarea' : 'input', Object.assign({ id: id, className: 'oj-input-field', 'aria-invalid': !!p.error, 'aria-describedby': (p.hint || p.error) ? hintId : undefined, rows: p.multiline ? 3 : undefined }, rest));
    return h('div', { className: cx('oj-input', p.error && 'is-error', p.disabled && 'is-disabled', p.className) },
      h('label', { className: 'oj-label', htmlFor: id }, p.label),
      h('div', { className: 'oj-input-wrap' }, p.icon ? h(Icon, { name: p.icon, size: 20, className: 'oj-input-icon' }) : null, field),
      p.error ? h('div', { id: hintId, className: 'oj-input-msg oj-body-sm' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, h('strong', null, 'Error: '), p.error))
        : p.hint ? h('div', { id: hintId, className: 'oj-input-msg oj-body-sm oj-muted' }, p.hint) : null);
  }

  function Divider(p) {
    var kind = p.kind || 'hair';
    if (p.label) return h('div', { className: cx('oj-divider-labelled', 'is-' + kind), role: 'separator', 'aria-label': p.label }, h('span', { className: 'oj-overline' }, p.label), h('span', { className: 'oj-divider-line', 'aria-hidden': true }));
    return h('hr', { className: cx('oj-divider', 'oj-divider-' + kind) });
  }

  function OjImage(p) {
    var ratio = (p.ratio || '4:5').split(':');
    return h('figure', { className: cx('oj-image', p.scrim && 'has-scrim', p.className) },
      h('div', { className: 'oj-image-frame', style: { aspectRatio: ratio[0] + ' / ' + ratio[1] } },
        p.src ? h('img', { src: p.src, alt: p.alt || '' })
          : h('div', { className: 'oj-image-empty', role: 'img', 'aria-label': p.alt || 'Photo' }, h(Graphic, { kind: 'o', size: 40 }), h('span', { className: 'oj-caption' }, p.alt || 'Photo')),
        p.children ? h('div', { className: 'oj-image-overlay', 'data-theme': 'live' }, p.children) : null),
      p.caption || p.credit ? h('figcaption', { className: 'oj-caption oj-muted' }, p.caption, p.credit ? h('span', null, ' · ' + p.credit) : null) : null);
  }

  function Sheet(p) {
    return h('section', { className: cx('oj-sheet', p.className), role: 'dialog', 'aria-modal': true, 'aria-label': p.title },
      h('div', { className: 'oj-sheet-grab', 'aria-hidden': true }),
      h('div', { className: 'oj-sheet-head' }, h('h3', { className: 'oj-title' }, p.title), h(IconButton, { icon: 'close', label: 'Close', onClick: p.onClose })),
      h('div', { className: 'oj-sheet-body' }, p.children),
      p.actions ? h('div', { className: 'oj-sheet-actions' }, p.actions) : null);
  }

  function Modal(p) {
    return h('div', { className: 'oj-modal', role: 'alertdialog', 'aria-modal': true, 'aria-labelledby': 'oj-modal-t', 'aria-describedby': 'oj-modal-b' },
      h('h3', { id: 'oj-modal-t', className: 'oj-display oj-display-sm' }, p.title),
      h('p', { id: 'oj-modal-b', className: 'oj-body oj-muted' }, p.body),
      h('div', { className: 'oj-modal-actions' },
        h(Button, { variant: 'secondary', onClick: p.onCancel }, p.cancel || 'KEEP IT'),
        h(Button, { variant: 'primary', onClick: p.onConfirm }, p.confirm || 'CONFIRM')));
  }

  var TOAST_ICON = { success: 'check', offline: 'offline', error: 'alert', neutral: null };
  function Toast(p) {
    var kind = p.kind || 'neutral', ic = TOAST_ICON[kind];
    return h('div', { className: cx('oj-toast', 'oj-toast-' + kind), role: kind === 'error' ? 'alert' : 'status', 'aria-live': kind === 'error' ? 'assertive' : 'polite' },
      ic ? h(Icon, { name: ic, size: 20 }) : null,
      h('span', { className: 'oj-body-sm oj-toast-msg' }, p.message),
      p.action ? h('button', { type: 'button', className: 'oj-toast-action oj-label', onClick: p.onAction }, p.action) : null);
  }

  function Skeleton(p) {
    var kind = p.kind || 'strip';
    var bars = kind === 'object'
      ? [h('span', { key: 1, className: 'oj-skel oj-skel-over' }), h('span', { key: 2, className: 'oj-skel oj-skel-display' }), h('span', { key: 3, className: 'oj-skel oj-skel-progress' }), h('span', { key: 4, className: 'oj-skel oj-skel-btn' })]
      : kind === 'text' ? Array.from({ length: p.lines || 3 }, function (_, i) { return h('span', { key: i, className: 'oj-skel oj-skel-line', style: { width: (i === (p.lines || 3) - 1 ? 60 : 100) + '%' } }); })
        : [h('span', { key: 1, className: 'oj-skel oj-skel-time' }), h('span', { key: 2, className: 'oj-skel-col' }, h('span', { className: 'oj-skel oj-skel-line', style: { width: '70%' } }), h('span', { className: 'oj-skel oj-skel-line', style: { width: '40%' } })), h('span', { key: 3, className: 'oj-skel oj-skel-badge' })];
    return h('div', { className: cx('oj-skeleton', 'oj-skeleton-' + kind), 'aria-busy': true, 'aria-label': p.label || 'Loading' }, bars);
  }

  /* ---------- More social ---------- */
  var ROLE = { host: 'HOST', in: "I'M DOWN", invited: 'INVITED', maybe: 'MAYBE', checked: 'CHECKED IN' };
  function ParticipantRow(p) {
    var role = p.role || 'in';
    return h('div', { className: 'oj-prow', role: 'listitem', 'aria-label': p.person.name + ', ' + ROLE[role].toLowerCase() },
      h(Avatar, { name: p.person.name, src: p.person.src, size: 'md' }),
      h('div', { className: 'oj-prow-main' }, h('span', { className: 'oj-title-sm' }, p.person.name), p.meta ? h('span', { className: 'oj-caption oj-muted' }, p.meta) : null),
      role === 'checked' ? h(VerificationBadge, { level: 'checked-in' }) : h(Badge, { tone: role === 'host' ? 'signal' : 'neutral' }, ROLE[role]),
      p.action ? h(Button, { variant: 'ghost', onClick: p.onAction }, p.action) : null);
  }

  var VERIFY = { 'checked-in': 'CHECKED IN', 'result': 'RESULT VERIFIED', 'identity': 'ID VERIFIED', 'host': 'TRUSTED HOST' };
  function VerificationBadge(p) {
    var level = p.level || 'checked-in';
    return h('span', { className: cx('oj-verify', 'oj-verify-' + level) },
      h('span', { className: 'oj-verify-o', 'aria-hidden': true }, h(Icon, { name: 'check', size: 12, strokeWidth: 3 })), VERIFY[level]);
  }

  function UserMiniCard(p) {
    return h('article', { className: 'oj-usercard', 'aria-label': p.name + ', ' + (p.sports || []).join(', ') },
      h('div', { className: 'oj-usercard-top' }, h(Avatar, { name: p.name, src: p.src, size: 'lg' }),
        h('div', { className: 'oj-usercard-id' }, h('div', { className: 'oj-row', style: { gap: 8 } }, h('span', { className: 'oj-title' }, p.name), p.verified ? h(VerificationBadge, { level: 'identity' }) : null), h('span', { className: 'oj-body-sm oj-muted' }, '@' + p.handle + (p.area ? ' · ' + p.area : '')))),
      h('div', { className: 'oj-usercard-stats' }, (p.stats || []).map(function (s, i) { return h('div', { key: i }, h('div', { className: 'oj-display oj-display-xs' }, s.value), h('div', { className: 'oj-caption oj-muted' }, s.label)); })),
      h('div', { className: 'oj-row' }, (p.sports || []).map(function (s) { return h(Badge, { key: s }, s); })),
      h('div', { className: 'oj-row' }, h(Button, { variant: p.following ? 'secondary' : 'primary', 'aria-pressed': !!p.following, onClick: p.onFollow }, p.following ? 'FOLLOWING' : 'FOLLOW'), h(Button, { variant: 'ghost', onClick: p.onCallOut }, 'CALL OUT')));
  }

  function PlaceMiniCard(p) {
    return h('a', { href: p.href || '#', className: 'oj-place', 'aria-label': p.name + ', ' + p.kind + ', ' + p.distance + (p.plansTonight ? ', ' + p.plansTonight + ' plans tonight' : '') },
      h('span', { className: 'oj-place-o', 'aria-hidden': true }, h(Icon, { name: 'pin' })),
      h('span', { className: 'oj-place-main' },
        h('span', { className: 'oj-title-sm' }, p.name),
        h('span', { className: 'oj-body-sm oj-muted' }, [p.kind, p.surface, p.distance].filter(Boolean).join(' · ')),
        p.lights ? h('span', { className: 'oj-caption oj-place-lights' }, h(Icon, { name: 'lights', size: 14 }), 'Floodlit until ' + p.lights) : null),
      p.plansTonight ? h('span', { className: 'oj-place-count' }, h('span', { className: 'oj-display oj-display-xs' }, String(p.plansTonight)), h('span', { className: 'oj-label-sm oj-muted' }, 'TONIGHT')) : null);
  }

  function ReactionBar(p) {
    return h('div', { className: 'oj-reactions', role: 'group', 'aria-label': 'Reactions' }, (p.reactions || []).map(function (r, i) {
      return h('button', { key: i, type: 'button', className: cx('oj-reaction', r.mine && 'is-mine'), 'aria-pressed': !!r.mine, 'aria-label': r.label + ', ' + r.count + (r.mine ? ', you reacted' : ''), onClick: p.onReact ? function () { p.onReact(r.label); } : undefined },
        h('span', { className: 'oj-label-sm' }, r.label), h('span', { className: 'oj-numeric' }, String(r.count)));
    }));
  }

  function Comment(p) {
    return h('article', { className: cx('oj-comment', p.reply && 'is-reply') },
      h(Avatar, { name: p.author, size: 'sm' }),
      h('div', { className: 'oj-comment-main' },
        h('div', { className: 'oj-post-head' }, h('span', { className: 'oj-title-sm' }, p.author), p.badge ? h(Badge, null, p.badge) : null, h('span', { className: 'oj-caption oj-muted' }, p.time)),
        h('p', { className: 'oj-body-sm oj-comment-body' }, p.body),
        h('div', { className: 'oj-comment-actions' },
          h('button', { type: 'button', className: 'oj-textbtn oj-label-sm', onClick: p.onReply }, 'REPLY'),
          h('button', { type: 'button', className: cx('oj-textbtn', 'oj-label-sm', p.respected && 'is-on'), 'aria-pressed': !!p.respected, onClick: p.onRespect }, (p.respected ? 'RESPECTED' : 'RESPECT') + (p.respect ? ' · ' + p.respect : '')),
          p.replies ? h('button', { type: 'button', className: 'oj-textbtn oj-label-sm' }, p.replies + ' REPLIES') : null)));
  }

  function Poll(p) {
    var opts = p.options || [], total = opts.reduce(function (s, o) { return s + o.votes; }, 0) || 1, voted = p.voted != null;
    return h('section', { className: 'oj-poll', 'aria-label': p.question },
      h('div', { className: 'oj-poll-head' }, h('h4', { className: 'oj-display oj-display-sm' }, p.question), p.closes ? h('span', { className: 'oj-caption oj-muted' }, 'Closes ' + p.closes) : null),
      h('div', { className: 'oj-poll-opts', role: voted ? 'list' : 'radiogroup' }, opts.map(function (o, i) {
        var pct = Math.round(o.votes / total * 100), mine = p.voted === i;
        return voted
          ? h('div', { key: i, role: 'listitem', className: cx('oj-poll-result', mine && 'is-mine'), 'aria-label': o.label + ', ' + pct + ' percent' + (mine ? ', your vote' : '') },
            h('span', { className: 'oj-poll-fill', style: { width: pct + '%' }, 'aria-hidden': true }),
            h('span', { className: 'oj-poll-label oj-title-sm' }, mine ? h(Icon, { name: 'check', size: 16 }) : null, o.label),
            h('span', { className: 'oj-numeric' }, pct + '%'))
          : h('button', { key: i, type: 'button', role: 'radio', 'aria-checked': false, className: 'oj-poll-opt oj-title-sm', onClick: p.onVote ? function () { p.onVote(i); } : undefined }, o.label);
      })),
      h('div', { className: 'oj-caption oj-muted' }, (total === 1 && !opts.some(function (o) { return o.votes; }) ? 0 : total) + ' votes'));
  }

  function CrewMomentum(p) {
    return h('section', { className: 'oj-crew', 'aria-label': p.crew + ' crew, ' + p.memberCount + ' members' },
      h('div', { className: 'oj-crew-top' },
        h('div', null, h('div', { className: 'oj-overline' }, 'CREW · ' + p.memberCount), h('h3', { className: 'oj-display oj-display-md' }, p.crew)),
        h(AvatarCluster, { people: p.members || [], total: p.memberCount, max: 5, size: 'md' })),
      h(MomentumMeter, { weeks: p.weeks, streak: p.streak, label: 'RHYTHM · 8 WEEKS' }),
      p.next ? h('div', { className: 'oj-crew-next' }, h('span', { className: 'oj-label oj-muted' }, 'NEXT'), h('span', { className: 'oj-title-sm' }, p.next), h(Button, { variant: 'secondary' }, "I'M DOWN")) : null);
  }

  /* ---------- More movement ---------- */
  function ActivityObject(p) {
    var status = p.status || 'forming', left = Math.max(0, (p.capacity || 0) - (p.count || 0));
    var theme = status === 'confirmed' ? 'confirmed' : status === 'live' ? 'live' : 'calm';
    return h('article', { className: 'oj-activity', 'data-theme': theme, 'aria-label': p.activity + ', ' + p.day + ' ' + p.time + ', ' + p.place + '. ' + p.count + ' of ' + p.capacity + ' in.' },
      h('div', { className: 'oj-activity-when' }, h('span', { className: 'oj-label oj-muted' }, p.day), h('span', { className: 'oj-display oj-display-lg' }, p.time)),
      h('div', { className: 'oj-activity-main' },
        h('div', { className: 'oj-row', style: { justifyContent: 'space-between' } }, h('h3', { className: 'oj-title' }, p.activity),
          status === 'live' ? h(LiveIndicator) : status === 'confirmed' ? h(Badge, { tone: 'signal' }, 'GAME ON') : h(Badge, null, p.count + ' / ' + p.capacity)),
        h('div', { className: 'oj-activity-meta oj-body-sm oj-muted' }, h('span', null, h(Icon, { name: 'pin', size: 16 }), p.place + (p.distance ? ' · ' + p.distance : '')), p.level ? h('span', null, h(Icon, { name: 'people', size: 16 }), p.level) : null),
        h(Progress, { value: p.count, max: p.capacity }),
        h('div', { className: 'oj-activity-foot' }, h(AvatarCluster, { people: p.people || [], total: p.count, max: 5, open: status === 'forming' ? Math.min(left, 2) : 0 }),
          h('div', { className: 'oj-row' }, p.details === false ? null : h(Button, { variant: 'ghost', onClick: p.onOpen }, 'DETAILS'), status === 'forming' ? h(Button, { variant: 'primary', 'aria-pressed': !!p.joined, onClick: p.onJoin }, p.joined ? "YOU'RE DOWN" : "I'M DOWN") : null))));
  }

  function RunItBack(p) {
    return h('section', { className: 'oj-runback', 'data-theme': 'after', 'aria-label': 'Run it back. ' + p.activity + ' with ' + p.crew + ', ' + p.suggested },
      h('div', { className: 'oj-overline' }, 'LAST ' + p.lastDate + ' · ' + p.count + ' PLAYED'),
      h('h3', { className: 'oj-display oj-display-xl' }, 'RUN IT', h('br'), 'BACK?'),
      h('p', { className: 'oj-body' }, 'Same crew, same spot: ', h('strong', null, p.suggested), '.'),
      h('div', { className: 'oj-runback-people' }, h(AvatarCluster, { people: p.people || [], total: p.count, max: 7 }), h('span', { className: 'oj-body-sm oj-muted' }, p.crew)),
      h('div', { className: 'oj-row' }, h(Button, { variant: 'commit', onClick: p.onRun }, 'RUN IT BACK'), h(Button, { variant: 'ghost', onClick: p.onChange }, 'CHANGE TIME')));
  }

  /* ---------- More competition ---------- */
  function LiveChallenge(p) {
    var a = p.a, b = p.b, target = p.target || 1;
    function lane(c, key) {
      var pct = Math.min(100, Math.round(c.value / target * 100));
      return h('div', { className: 'oj-lane', key: key, 'aria-label': c.name + ' ' + c.value + ' ' + p.unit + ' of ' + target + (c.checkedIn ? ', checked in' : '') },
        h('div', { className: 'oj-lane-head' }, h('span', { className: 'oj-display oj-display-sm' }, c.name.toUpperCase()), c.checkedIn ? h(VerificationBadge, { level: 'checked-in' }) : null,
          h('span', { className: 'oj-lane-val' }, h('span', { className: 'oj-display oj-display-lg' }, String(c.value)), h('span', { className: 'oj-label oj-muted' }, p.unit))),
        h('div', { className: 'oj-lane-track', 'aria-hidden': true }, h('span', { className: 'oj-lane-fill', style: { width: pct + '%' } })));
    }
    return h('section', { className: 'oj-poster oj-livechallenge', 'data-theme': 'live', 'aria-label': 'Live challenge, ' + a.name + ' versus ' + b.name },
      h('div', { className: 'oj-livechallenge-top' }, h(LiveIndicator), h('span', { className: 'oj-numeric oj-muted' }, p.elapsed), h('span', { className: 'oj-label oj-muted' }, p.discipline + ' · TARGET ' + target + ' ' + p.unit)),
      lane(a, 'a'), lane(b, 'b'),
      h('div', { className: 'oj-livechallenge-foot oj-body-sm oj-muted' }, p.watching ? p.watching + ' watching' : null));
  }

  function Rivalry(p) {
    var a = p.a, b = p.b, r = p.record || { a: 0, b: 0, draws: 0 };
    return h('section', { className: 'oj-poster oj-rivalry', 'data-theme': 'live', 'aria-label': 'Rivalry. ' + a.name + ' ' + r.a + ', ' + b.name + ' ' + r.b + (r.draws ? ', ' + r.draws + ' draws' : '') },
      h('div', { className: 'oj-overline' }, 'RIVALRY · ' + (r.a + r.b + (r.draws || 0)) + ' MEETINGS'),
      h('div', { className: 'oj-rivalry-score' },
        h('div', null, h('div', { className: 'oj-display oj-display-sm' }, a.name.toUpperCase()), h('div', { className: 'oj-display oj-display-hero' }, String(r.a))),
        h('span', { className: 'oj-rivalry-mark', 'aria-hidden': true }),
        h('div', { className: 'oj-right' }, h('div', { className: 'oj-display oj-display-sm' }, b.name.toUpperCase()), h('div', { className: 'oj-display oj-display-hero' }, String(r.b)))),
      h('div', null, h('div', { className: 'oj-label oj-muted', style: { marginBottom: 8 } }, 'FORM · LAST ' + (p.history || []).length + ' (OLDEST FIRST)'),
        h('div', { className: 'oj-form', role: 'list' }, (p.history || []).map(function (w, i) {
          var name = w === 'a' ? a.name : w === 'b' ? b.name : 'Draw';
          return h('span', { key: i, role: 'listitem', className: cx('oj-form-cell', 'is-' + w), 'aria-label': name }, w === 'd' ? '=' : name[0].toUpperCase());
        }))),
      p.next ? h('div', { className: 'oj-callout-foot' }, h('span', { className: 'oj-label oj-muted' }, 'NEXT'), h('span', { className: 'oj-title-sm' }, p.next)) : null);
  }

  function Rematch(p) {
    var requester = p.requester || p.from, opponent = p.opponent || p.to;
    return h('section', { className: 'oj-poster oj-rematch', 'data-theme': 'after', 'aria-label': 'Rematch. ' + requester + ' wants a rematch with ' + opponent + ', ' + p.discipline },
      h('div', { className: 'oj-overline' }, 'LAST TIME · ' + p.lastResult),
      h('div', { className: 'oj-rematch-head' }, h('h3', { className: 'oj-display oj-display-lg' }, 'REMATCH?'), h(Graphic, { kind: 'mark', size: 64, className: 'oj-signal-ink' })),
      h('p', { className: 'oj-body' }, h('strong', null, requester), ' wants ', p.discipline, ' again. ', p.note || ''),
      h('div', { className: 'oj-row' }, h(Button, { variant: 'primary', onClick: p.onAccept }, 'RUN IT BACK'), h(Button, { variant: 'secondary', onClick: p.onDecline }, 'NOT YET')));
  }


  window.Ojoro = Object.assign(window.Ojoro || {}, {
    Button: Button, DisplayText: DisplayText, Avatar: Avatar, Badge: Badge, Chip: Chip, Progress: Progress,
    AvatarCluster: AvatarCluster, LiveIndicator: LiveIndicator, Countdown: Countdown, PredictionBar: PredictionBar, CrowdSupport: CrowdSupport, MomentumMeter: MomentumMeter,
    DownFor: DownFor, PlanForming: PlanForming, GameOnPoster: GameOnPoster, ActivityStrip: ActivityStrip,
    CallOutPoster: CallOutPoster, ChallengeEventHero: ChallengeEventHero, HypePost: HypePost, RecapPoster: RecapPoster,
    PassportStamp: PassportStamp, Graphic: Graphic,
    Icon: Icon, IconButton: IconButton, Input: Input, Divider: Divider, Image: OjImage, Sheet: Sheet, Modal: Modal, Toast: Toast, Skeleton: Skeleton,
    ParticipantRow: ParticipantRow, VerificationBadge: VerificationBadge, UserMiniCard: UserMiniCard, PlaceMiniCard: PlaceMiniCard, ReactionBar: ReactionBar, Comment: Comment, Poll: Poll, CrewMomentum: CrewMomentum,
    ActivityObject: ActivityObject, RunItBack: RunItBack, LiveChallenge: LiveChallenge, Rivalry: Rivalry, Rematch: Rematch
  });
})();
