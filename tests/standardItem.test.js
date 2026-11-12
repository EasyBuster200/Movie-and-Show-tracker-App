const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

// Values created inside the vm context have that context's Object.prototype, which
// deepStrictEqual treats as a different type - round-trip through JSON to compare plainly.
const plain = value => JSON.parse(JSON.stringify(value));

const { run, context } = createApp({ withProfile: false });

test('toStandardItem maps a TMDB movie', () => {
  const item = context.toStandardItem({
    id: 550, title: 'Fight Club', release_date: '1999-10-15', poster_path: '/p.jpg', vote_average: 8.4,
  }, 'movie');
  assert.deepEqual(plain(item), {
    tmdbId: 550, mediaType: 'movie', title: 'Fight Club', year: '1999',
    releaseDate: '1999-10-15', posterPath: '/p.jpg', voteAverage: 8.4,
  });
});

test('toStandardItem maps a TMDB show (name/first_air_date)', () => {
  const item = plain(context.toStandardItem({ id: 1399, name: 'Game of Thrones', first_air_date: '2011-04-17' }, 'tv'));
  assert.equal(item.title, 'Game of Thrones');
  assert.equal(item.year, '2011');
  assert.equal(item.releaseDate, '2011-04-17');
  assert.equal(item.mediaType, 'tv');
});

test('toStandardItem infers mediaType from media_type when not given', () => {
  assert.equal(context.toStandardItem({ id: 1, media_type: 'movie' }).mediaType, 'movie');
  assert.equal(context.toStandardItem({ id: 1, media_type: 'tv' }).mediaType, 'tv');
});

test('toStandardItem handles missing title and date', () => {
  const item = plain(context.toStandardItem({ id: 7 }, 'movie'));
  assert.equal(item.title, 'Untitled');
  assert.equal(item.year, null);
  assert.equal(item.releaseDate, null);
});

test('pickSummaryFields keeps only present display fields', () => {
  assert.deepEqual(
    plain(context.pickSummaryFields({ tmdbId: 1, title: 'X', year: null, posterPath: undefined, extra: true })),
    { title: 'X', year: null },
  );
  assert.deepEqual(plain(context.pickSummaryFields(null)), {});
});

test('isUnreleased: missing or future dates are unreleased', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  context.__now = now;
  assert.equal(run("isUnreleased(null, __now)"), true);
  assert.equal(run("isUnreleased('', __now)"), true);
  assert.equal(run("isUnreleased('2026-06-02', __now)"), true);
  assert.equal(run("isUnreleased('2026-05-31', __now)"), false);
  assert.equal(run("isUnreleased('2026-06-01', __now)"), false);
});
