import type { Report } from '../../validation/report.ts'
import type { HintSet } from '../../hints/types.ts'
import type { LoadedDocument } from '../../intake/types.ts'
import type { ReportView } from '../../config/types.ts'
import type { WorkbenchState } from '../../workbench/useWorkbench.ts'
import { ReportSection } from '../ReportSection.tsx'
import { RunPanel } from '../RunPanel.tsx'

type RunStepProps = {
  wb: WorkbenchState
  loaded: LoadedDocument | null
  report: Report | null
  view: ReportView
  hints?: HintSet
}

export const RunStep: React.FC<RunStepProps> = ({
  wb,
  loaded,
  report,
  view,
  hints,
}) => {
  const { run, catalogue, selection, adapter } = wb
  return (
    <>
      {catalogue && selection && (
        <RunPanel
          catalogue={catalogue}
          selection={selection}
          adapter={adapter}
          document={loaded?.document ?? null}
          run={run}
          onStart={(request) => wb.start(adapter, request)}
          onCancel={wb.cancel}
        />
      )}
      {run && report && (
        <ReportSection
          run={run}
          report={report}
          {...(hints && { hints })}
          adapter={wb.adapters[run.request.validator]}
          view={view}
        />
      )}
    </>
  )
}
