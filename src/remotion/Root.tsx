import { Composition } from 'remotion'
import { sampleExplainerInput, type ExplainerInput } from '@shared/explainer'
import { ExplainerVideo } from './explainer/ExplainerVideo'
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
      <Composition
        id="Explainer"
        component={ExplainerVideo}
        defaultProps={sampleExplainerInput('tutorial', '16:9', '')}
        // Length, size and frame rate come from the project, through the props the app sends.
        calculateMetadata={({ props }: { props: ExplainerInput }) => ({
          durationInFrames: props.totalFrames,
          fps: props.fps,
          width: props.width,
          height: props.height
        })}
      />
    </>
  )
}
