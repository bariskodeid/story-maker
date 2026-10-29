import type { ExportOptions, Project } from '@shared/types'

/** A file or folder name from a title: lowercase words joined by dashes. */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'video'
  )
}

/** The export dialog's starting options; automatic export uses them as they are, so both give the same file. */
export function defaultExportOptions(project: Project, folder: string): ExportOptions {
  return {
    fileName: slug(project.title),
    resolution: 1080,
    fps: 30,
    burnCaptions: project.editor.captionStyle !== 'none',
    writeSrt: false,
    normalizeAudio: true,
    duckMusic: project.editor.duckMusic,
    folder
  }
}
