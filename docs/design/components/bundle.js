/* @ds-bundle: {"format":4,"namespace":"TVTracker","components":[{"name":"Icon"},{"name":"Button"},{"name":"SearchField"},{"name":"SectionHeader"},{"name":"BackButton"},{"name":"PosterArt"},{"name":"PosterCard"},{"name":"MediaRow"},{"name":"AiringRow"},{"name":"CastCard"},{"name":"Chip"},{"name":"Switch"},{"name":"ProgressBar"},{"name":"SeasonRow"},{"name":"EpisodeCard"},{"name":"StatTile"},{"name":"BottomNav"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  var PATHS = {
    home: ['M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z'],
    bookmark: ['M6 3.5h12v17l-6-4.5-6 4.5z'],
    folder: ['M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'],
    film: ['M4.5 3.5h15v17h-15z', 'M8.5 3.5v17', 'M15.5 3.5v17', 'M4.5 8h4', 'M4.5 16h4', 'M15.5 8h4', 'M15.5 16h4'],
    tv: ['M3 7.5h18v12H3z', 'M8 3l4 4.5L16 3'],
    user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
    eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    heart: ['M12 20s-7.5-4.6-9.2-9.4A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 9.2 3.4C19.5 15.4 12 20 12 20z'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20.5 20.5l-4.5-4.5'],
    back: ['M19 12H5', 'M11 6l-6 6 6 6'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
    chevron: ['M9 6l6 6-6 6'],
    play: ['M7 4.5v15l12-7.5z'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    plus: ['M12 5v14', 'M5 12h14'],
    more: ['M10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z', 'M3.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z', 'M17.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z'],
    cloud: ['M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z', 'M9.5 13.5l2 2 3.5-3.5']
  };

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function initials(title) {
    return String(title || '')
      .split(/\s+/)
      .filter(function (w) { return /[A-Za-z0-9]/.test(w.charAt(0)); })
      .slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); })
      .join('');
  }

  function Icon(props) {
    var size = props.size || 24;
    var d = PATHS[props.name] || [];
    return h('svg', {
      className: 'tt-icon',
      width: size, height: size, viewBox: '0 0 24 24',
      fill: props.filled ? 'currentColor' : 'none',
      stroke: 'currentColor', strokeWidth: props.strokeWidth || 1.8,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
    }, d.map(function (p, i) {
      // A filled eye keeps a visible pupil: the inner circle is cut out in the page colour.
      var cut = props.filled && props.name === 'eye' && i === 1;
      return h('path', { key: i, d: p, fill: cut ? 'var(--bg-page)' : undefined, stroke: cut ? 'var(--bg-page)' : undefined });
    }));
  }

  function Button(props) {
    var variant = props.variant || 'primary';
    var iconOnly = !!props.iconOnly;
    return h('button', {
      type: 'button',
      className: cx('tt-btn', 'tt-btn--' + variant, iconOnly && 'tt-btn--icon'),
      onClick: props.onClick,
      'aria-label': iconOnly ? props.label : undefined
    },
      props.icon ? h(Icon, { name: props.icon, size: 20 }) : null,
      iconOnly ? null : props.children
    );
  }

  function SearchField(props) {
    var _s = React.useState(props.value || '');
    var value = props.value != null ? props.value : _s[0];
    return h('label', { className: 'tt-search' },
      h(Icon, { name: 'search', size: 20 }),
      h('span', { className: 'tt-sr' }, props.label || 'Search'),
      h('input', {
        type: 'search', value: value,
        placeholder: props.placeholder || 'Search movies and shows…',
        onChange: function (e) { _s[1](e.target.value); if (props.onChange) props.onChange(e.target.value); }
      })
    );
  }

  function SectionHeader(props) {
    return h('div', { className: 'tt-section' },
      h('h2', null, props.title),
      props.action
        ? (props.actionHref
          ? h('a', { className: 'tt-link', href: props.actionHref, style: { textDecoration: 'none' } }, props.action)
          : h('button', { type: 'button', className: 'tt-link', onClick: props.onAction }, props.action))
        : null
    );
  }

  function BackButton(props) {
    var label = props.label || 'Back';
    var icon = h(Icon, { name: 'back', size: 20, strokeWidth: 2 });
    return props.href
      ? h('a', { className: 'tt-back', href: props.href, 'aria-label': label }, icon)
      : h('button', { type: 'button', className: 'tt-back', 'aria-label': label, onClick: props.onClick }, icon);
  }

  function PosterArt(props) {
    var w = props.width || 132;
    var title = props.title || '';
    return h('div', { className: 'tt-poster__art', style: { width: w } },
      props.image
        ? h('img', { src: props.image, alt: title + ' poster' })
        : h('div', { className: 'tt-poster__ph', style: { fontSize: Math.max(14, Math.round(w * 0.2)) }, 'aria-hidden': 'true' }, initials(title)),
      props.children
    );
  }

  function MediaRow(props) {
    var tag = props.href ? 'a' : 'button';
    var hasProgress = props.total > 0;
    return h(tag, {
      className: 'tt-media', href: props.href, type: props.href ? undefined : 'button', onClick: props.onClick
    },
      h(PosterArt, { title: props.title, image: props.image, width: 56 }),
      h('span', { className: 'tt-media__body' },
        h('span', { className: 'tt-media__title' }, props.title),
        props.meta ? h('span', { className: 'tt-media__meta' }, props.meta) : null,
        hasProgress ? h(ProgressBar, { value: props.watched || 0, max: props.total, label: props.title + ' progress' }) : null,
        hasProgress ? h('span', { className: 'tt-media__meta' }, (props.watched || 0) + '/' + props.total + ' episodes watched') : null
      )
    );
  }

  function AiringRow(props) {
    var tag = props.href ? 'a' : 'div';
    return h(tag, { className: 'tt-airing', href: props.href },
      h('span', { className: 'tt-airing__date', 'aria-hidden': 'true' },
        h('span', { className: 'tt-airing__dow' }, props.day),
        h('span', { className: 'tt-airing__num' }, props.date)
      ),
      h('span', { className: 'tt-airing__body' },
        h('span', { className: 'tt-airing__title' }, props.title),
        props.episode ? h('span', { className: 'tt-airing__ep' }, props.episode) : null
      ),
      props.when ? h('span', { className: cx('tt-airing__when', props.soon && 'tt-airing__when--soon') },
        h('span', { className: 'tt-sr' }, props.day + ' ' + props.date + ', '), props.when) : null
    );
  }

  function CastCard(props) {
    var name = props.name || '';
    return h('div', { className: 'tt-cast' },
      h('div', { className: 'tt-cast__photo' },
        props.image ? h('img', { src: props.image, alt: name }) : h('span', { 'aria-hidden': 'true' }, initials(name))
      ),
      h('span', { className: 'tt-cast__name' }, name),
      props.role ? h('span', { className: 'tt-cast__role' }, props.role) : null
    );
  }

  function Chip(props) {
    var on = !!props.selected;
    return h('button', {
      type: 'button', className: cx('tt-chip', on && 'tt-chip--on'), 'aria-pressed': on, onClick: props.onClick
    },
      props.check && on ? h(Icon, { name: 'check', size: 16, strokeWidth: 2.2 }) : null,
      props.label,
      props.count != null ? h('span', { className: 'tt-chip__count' }, props.count) : null);
  }

  function Switch(props) {
    var _s = React.useState(!!props.checked);
    var on = props.checked != null && props.onChange ? !!props.checked : _s[0];
    return h('button', {
      type: 'button', role: 'switch', 'aria-checked': on, 'aria-label': props.label,
      className: cx('tt-switch', on && 'tt-switch--on'),
      onClick: function () { _s[1](!on); if (props.onChange) props.onChange(!on); }
    }, h('span', { className: 'tt-switch__knob', 'aria-hidden': 'true' }));
  }

  function PosterCard(props) {
    var _w = React.useState(!!props.watched);
    var _f = React.useState(!!props.favorite);
    var _b = React.useState(!!props.bookmarked);
    var watched = _w[0], fav = _f[0], saved = _b[0];
    var title = props.title || '';
    return h('div', { className: 'tt-poster', style: { width: props.width || 132 } },
      h(PosterArt, { title: title, image: props.image, width: props.width || 132 },
        h('button', {
          type: 'button', className: cx('tt-toggle', 'tt-toggle--watch', watched && 'tt-toggle--on'),
          style: { top: 8, right: 8 }, 'aria-pressed': watched,
          'aria-label': (watched ? 'Unmark ' : 'Mark ') + title + ' as watched',
          onClick: function () { _w[1](!watched); if (props.onToggleWatched) props.onToggleWatched(!watched); }
        }, h(Icon, { name: 'eye', size: 18, filled: watched })),
        h('button', {
          type: 'button', className: cx('tt-toggle', 'tt-toggle--fav', fav && 'tt-toggle--on'),
          style: { bottom: 8, left: 8 }, 'aria-pressed': fav,
          'aria-label': (fav ? 'Remove ' : 'Add ') + title + (fav ? ' from' : ' to') + ' favourites',
          onClick: function () { _f[1](!fav); if (props.onToggleFavorite) props.onToggleFavorite(!fav); }
        }, h(Icon, { name: 'heart', size: 18, filled: fav })),
        props.removable
          ? h('button', {
            type: 'button', className: 'tt-toggle', style: { top: 8, left: 8 },
            'aria-label': 'Remove ' + title + ' from ' + (props.removeFrom || 'this list'),
            onClick: props.onRemove
          }, h(Icon, { name: 'close', size: 18 }))
          : h('button', {
            type: 'button', className: cx('tt-toggle', 'tt-toggle--save', saved && 'tt-toggle--on'),
            style: { bottom: 8, right: 8 }, 'aria-pressed': saved,
            'aria-label': (saved ? 'Remove ' + title + ' from' : 'Add ' + title + ' to') + ' watchlist',
            onClick: function () { _b[1](!saved); if (props.onToggleBookmark) props.onToggleBookmark(!saved); }
          }, h(Icon, { name: 'bookmark', size: 18, filled: saved }))
      ),
      props.meta ? h('span', { className: 'tt-poster__meta' }, props.meta) : null,
      h('span', { className: 'tt-poster__title' }, title),
      props.detail ? h('span', { className: 'tt-poster__meta' }, props.detail) : null
    );
  }

  function ProgressBar(props) {
    var max = props.max || 1;
    var pct = Math.max(0, Math.min(100, ((props.value || 0) / max) * 100));
    return h('div', {
      className: 'tt-progress', role: 'progressbar',
      'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': props.value || 0,
      'aria-label': props.label || 'Progress'
    }, h('div', { className: 'tt-progress__fill', style: { width: pct + '%' } }));
  }

  function SeasonRow(props) {
    var done = props.total > 0 && props.watched >= props.total;
    return h('button', {
      type: 'button', className: cx('tt-row', done && 'tt-row--done'), onClick: props.onClick
    },
      h('span', { className: 'tt-row__label' }, props.label),
      h('span', { className: 'tt-row__count' },
        done ? h(Icon, { name: 'check', size: 16, strokeWidth: 2.2 }) : null,
        props.watched + '/' + props.total + ' watched',
        h(Icon, { name: 'chevron', size: 16 })
      )
    );
  }

  function EpisodeCard(props) {
    var _w = React.useState(!!props.watched);
    var watched = _w[0];
    var meta = [props.date, props.runtime].filter(Boolean).join(' • ');
    return h('article', { className: 'tt-episode' },
      h('div', { className: 'tt-episode__still' },
        props.image ? h('img', { src: props.image, alt: '' }) : null
      ),
      h('div', { className: 'tt-episode__head' },
        h('span', { className: 'tt-episode__num' }, props.number),
        h('span', { className: 'tt-episode__title' }, props.title),
        h('button', {
          type: 'button', className: cx('tt-toggle', 'tt-toggle--watch', 'tt-episode__check', watched && 'tt-toggle--on'),
          'aria-pressed': watched,
          'aria-label': (watched ? 'Unmark ' : 'Mark ') + 'episode ' + props.number + ' as watched',
          onClick: function () { _w[1](!watched); if (props.onToggle) props.onToggle(!watched); }
        }, h(Icon, { name: 'eye', size: 18, filled: watched }))
      ),
      meta ? h('span', { className: 'tt-episode__meta' }, meta) : null,
      props.synopsis ? h('p', { className: 'tt-episode__body' }, props.synopsis) : null,
      props.synopsis ? h('button', { type: 'button', className: 'tt-link', style: { alignSelf: 'flex-start' } }, 'Show more') : null
    );
  }

  function StatTile(props) {
    return h('div', { className: 'tt-stat' },
      h('span', { className: 'tt-stat__value' }, props.value),
      h('span', { className: 'tt-stat__label' }, props.label)
    );
  }

  var NAV = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'watchlist', icon: 'bookmark', label: 'Watchlist' },
    { id: 'lists', icon: 'folder', label: 'Lists' },
    { id: 'movies', icon: 'film', label: 'Movies' },
    { id: 'shows', icon: 'tv', label: 'Shows' },
    { id: 'profile', icon: 'user', label: 'Profile' }
  ];

  function BottomNav(props) {
    var _a = React.useState(props.active || 'home');
    var active = _a[0];
    return h('nav', { className: 'tt-nav', 'aria-label': 'Main' },
      NAV.map(function (it) {
        var on = it.id === active;
        return h('button', {
          key: it.id, type: 'button', className: cx('tt-nav__item', on && 'tt-nav__item--on'),
          'aria-label': it.label, 'aria-current': on ? 'page' : undefined,
          onClick: function () { _a[1](it.id); if (props.onChange) props.onChange(it.id); }
        }, h(Icon, { name: it.icon, size: 24, strokeWidth: on ? 2 : 1.8 }));
      })
    );
  }

  window.TVTracker = {
    Icon: Icon, Button: Button, SearchField: SearchField, SectionHeader: SectionHeader,
    BackButton: BackButton, PosterArt: PosterArt, PosterCard: PosterCard, MediaRow: MediaRow, AiringRow: AiringRow, CastCard: CastCard, Chip: Chip, Switch: Switch, ProgressBar: ProgressBar, SeasonRow: SeasonRow,
    EpisodeCard: EpisodeCard, StatTile: StatTile, BottomNav: BottomNav
  };
})();
