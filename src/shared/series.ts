/** Episode numbering and cast matching, shared by the main process and the renderer (series page, export names). */

export const MIN_EPISODES = 2
export const MAX_EPISODES = 20

/** "E01", "E12". */
export function episodeTag(no: number): string {
  return `E${String(no).padStart(2, '0')}`
}

const TAG_PREFIX = /^E\d+\s*·\s*/

/** An episode project's title: "E01 · The title". */
export function episodeProjectTitle(no: number, title: string): string {
  return `${episodeTag(no)} · ${stripEpisodeTag(title) || `Episode ${no}`}`
}

/** The episode's own title, without the "E01 · " the project title starts with. */
export function stripEpisodeTag(title: string): string {
  return title.replace(TAG_PREFIX, '').trim()
}

/** Cast members are matched between a series and its episodes by name, ignoring case and outer spaces. */
export function castKey(name: string): string {
  return name.trim().toLowerCase()
}

/** The names in a `cast_removed_json` column (cast members removed by hand), as cast keys. */
export function parseCastNames(json: unknown): string[] {
  try {
    const v = JSON.parse(typeof json === 'string' && json ? json : '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(castKey) : []
  } catch {
    return []
  }
}
