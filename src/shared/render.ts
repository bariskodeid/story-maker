/** The headless browser Remotion renders explainer videos with (Chrome Headless Shell, downloaded once). */
export interface RenderEngineStatus {
  state: 'missing' | 'downloading' | 'ready'
  received: number
  total: number
  /** Size on disk once installed, in bytes. */
  sizeBytes: number | null
  error: string | null
  /** The last download was cancelled (from Settings or with the export that started it); not an error. */
  cancelled: boolean
}

export interface RenderTestResult {
  ms: number
  path: string
  bytes: number
}
