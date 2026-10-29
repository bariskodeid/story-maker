import type { SeriesContinuity, SeriesKind } from '@shared/types'

/**
 * What one episode is called on screen: an explainer course is made of lessons ("pelajaran"); story series and
 * explainer series of standalone episodes have episodes.
 */
export function episodeWord(s: { kind: SeriesKind; continuity: SeriesContinuity }): { one: string; title: string } {
  return s.kind === 'explainer' && s.continuity === 'serial' ? { one: 'pelajaran', title: 'Pelajaran' } : { one: 'episode', title: 'Episode' }
}

/** "Seri bersambung", "Seri penjelasan berurutan", ... for subtitles. */
export function continuityLabel(s: { kind: SeriesKind; continuity: SeriesContinuity }): string {
  if (s.kind === 'explainer') return s.continuity === 'serial' ? 'Seri penjelasan berurutan' : 'Seri penjelasan lepas'
  return s.continuity === 'serial' ? 'Seri bersambung' : 'Seri antologi'
}
