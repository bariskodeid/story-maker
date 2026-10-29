import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { useFonts } from './fonts'

export type RenderTestProps = {
  fontBase: string
}

/**
 * A two-second check of the whole render path: the bundle, the headless browser, the compositor and a font
 * fetched from the render's asset server. Settings runs it so a user can tell the engine works before a real export.
 */
export function RenderTest({ fontBase }: RenderTestProps) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  useFonts(fontBase, [{ family: 'Poppins', file: 'Poppins-ExtraBold.ttf', weight: 800 }])
  const pop = spring({ frame, fps, config: { damping: 14 } })
  const bar = interpolate(frame, [0, durationInFrames - 1], [0, 100], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: '#1f1d1a', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ color: '#ffc93c', fontSize: 120, fontWeight: 800, transform: `scale(${0.6 + 0.4 * pop})` }}>Story Maker</div>
      <div style={{ color: '#faf7f2', fontSize: 40, fontWeight: 800, marginTop: 12, opacity: pop }}>Mesin render siap</div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 14, width: `${bar}%`, background: '#c93a1b' }} />
    </AbsoluteFill>
  )
}
