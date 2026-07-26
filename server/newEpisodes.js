const { fetchTmdb } = require('./tmdbClient');

// Bounded heuristic: only seasons at/after the highest season number the user has any
// watched episode in can plausibly contain "new since last watched" episodes — assumes
// users watch roughly in order, so we don't have to fetch every season of every
// in-progress show just to look for new episodes.
async function computeNewEpisodeSeasons({ tmdbId, watchedRows, lastWatchedAt, show }) {
  if (!lastWatchedAt || watchedRows.length === 0) {
    return { hasNewEpisodes: false, newSeasonNumbers: [] };
  }

  const watchedSet = new Set(watchedRows.map(r => `${r.season_number}:${r.episode_number}`));
  const maxWatchedSeason = Math.max(...watchedRows.map(r => r.season_number));
  const candidateSeasons = (show.seasons || []).filter(
    s => s.season_number > 0 && s.season_number >= maxWatchedSeason
  );

  const seasonData = await Promise.all(
    candidateSeasons.map(s => fetchTmdb(`/tv/${tmdbId}/season/${s.season_number}`))
  );

  const now = new Date();
  const lastWatched = new Date(lastWatchedAt);
  const newSeasonNumbers = [];

  candidateSeasons.forEach((s, i) => {
    const episodes = (seasonData[i] && seasonData[i].episodes) || [];
    const hasNew = episodes.some(ep =>
      ep.air_date &&
      new Date(ep.air_date) <= now &&
      new Date(ep.air_date) > lastWatched &&
      !watchedSet.has(`${s.season_number}:${ep.episode_number}`)
    );
    if (hasNew) newSeasonNumbers.push(s.season_number);
  });

  return { hasNewEpisodes: newSeasonNumbers.length > 0, newSeasonNumbers };
}

module.exports = { computeNewEpisodeSeasons };
