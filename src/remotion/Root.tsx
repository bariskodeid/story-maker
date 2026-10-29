import { Composition } from 'remotion'
import { RenderTest } from './RenderTest'

/** Every composition the main process can render. The app's Player imports the same components directly. */
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="RenderTest"
        component={RenderTest}
        durationInFrames={60}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ fontBase: '' }}
      />
    </>
  )
}
