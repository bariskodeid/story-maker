import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { needsVisual } from '@shared/script'
import type { Step } from '@shared/types'
import { Button, Spinner } from '../../components/ui'
import { useAutopilot } from '../../lib/autopilot'
import { errorText } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { AutopilotButton, AutopilotPanel } from './AutopilotPanel'
import { EditorStep } from './EditorStep'
import { ExportDialog } from './ExportDialog'
import { IdeaStep } from './IdeaStep'
import { ProjectHeader } from './ProjectHeader'
import { ScriptStep } from './ScriptStep'
import { StoryboardStep } from './StoryboardStep'

export function ProjectPage({ id }: { id: string }) {
  const { load, unload, loaded, project, clips } = useProject()
  const { toast, go } = useApp()
  const [exportOpen, setExportOpen] = useState(false)
  const autopilot = useAutopilot((s) => s.runs[id])

  useEffect(() => {
    let alive = true
    window.api.projects
      .get(id)
      // An episode takes the series cast (and its character sheets) before anything is generated in it.
      .then((b) => (b.project.seriesId ? window.api.series.syncCastIn(id) : b))
      .then((b) => alive && load(b))
      .catch((e) => {
        toast('error', errorText(e))
        go({ name: 'home' })
      })
    return () => {
      alive = false
      const episode = !!useProject.getState().project?.seriesId
      void useProject
        .getState()
        .flush()
        .then(unload)
        // Characters and sheets made while working on an episode by hand become available to the other episodes.
        .then(() => (episode ? window.api.series.syncCastOut(id) : null))
        .catch(() => undefined)
    }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useProject.getState().save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!loaded || !project)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-2">
        <Spinner />
        Membuka proyek…
      </div>
    )

  const done: Step[] = []
  if (clips.length) done.push(1)
  if (clips.length && !clips.some(needsVisual)) done.push(2)
  if (clips.length && clips.every((c) => c.imageAssetId)) done.push(3)

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader
        doneSteps={done}
        locked={!!autopilot}
        right={
          autopilot ? undefined : (
            <>
              <AutopilotButton />
              {project.step === 4 && (
                <Button variant="primary" icon={<Download className="size-[18px]" />} onClick={() => setExportOpen(true)}>
                  Ekspor video
                </Button>
              )}
            </>
          )
        }
      />
      <div className="min-h-0 flex-1">
        {autopilot ? (
          <AutopilotPanel run={autopilot} />
        ) : (
          <>
            {project.step === 1 && <IdeaStep />}
            {project.step === 2 && <ScriptStep />}
            {project.step === 3 && <StoryboardStep />}
            {project.step === 4 && <EditorStep />}
          </>
        )}
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
