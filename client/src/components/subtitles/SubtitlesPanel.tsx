import styled from 'styled-components';
import { Panel, PanelHeader, PanelBody } from '@/design-system/primitives/Panel';
import { ActionsBar } from './ActionsBar';
import { ExportBar } from './ExportBar';
import { StatusBar } from './StatusBar';
import { CueList } from './CueList';
import type { BurnMode, Cue, Status } from '@/types';

const Hint = styled.p`
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 14px;
  line-height: 1.5;

  b { color: ${({ theme }) => theme.colors.text}; font-weight: 500; }
  code {
    font-family: ${({ theme }) => theme.fonts.mono};
    color: ${({ theme }) => theme.colors.accentDim};
  }
`;

type Props = {
  cues: ReadonlyArray<Cue>;
  activeCueId: number | null;
  videoCurrentTime: number;

  model: string;
  onModelChange: (next: string) => void;
  language: string;
  onLanguageChange: (next: string) => void;
  onAutoTranscribe: () => void;
  autoBusy: boolean;

  onAddLine: () => void;
  canAddLine: boolean;
  onImport: (file: File) => void;

  burnMode: BurnMode;
  burnBusy: boolean;
  linkedInPrompt: string;
  onBurnModeChange: (mode: BurnMode) => void;
  onExportSrt: () => void;
  onExportVtt: () => void;
  onBurn: () => void;

  status: Status;
  progress: number | null;

  onCueUpdate: (id: number, patch: Partial<Omit<Cue, 'id'>>) => void;
  onCueDelete: (id: number) => void;
  onJump: (time: number) => void;
};

export function SubtitlesPanel(props: Props) {
  const hasCues = props.cues.length > 0;
  return (
    <Panel>
      <PanelHeader>Subtitles</PanelHeader>
      <PanelBody>
        <ActionsBar
          model={props.model}
          onModelChange={props.onModelChange}
          language={props.language}
          onLanguageChange={props.onLanguageChange}
          onAutoTranscribe={props.onAutoTranscribe}
          autoBusy={props.autoBusy}
          onAddLine={props.onAddLine}
          canAddLine={props.canAddLine}
          onImport={props.onImport}
        />
        <ExportBar
          canExport={hasCues}
          burnMode={props.burnMode}
          burnBusy={props.burnBusy}
          linkedInPrompt={props.linkedInPrompt}
          onBurnModeChange={props.onBurnModeChange}
          onExportSrt={props.onExportSrt}
          onExportVtt={props.onExportVtt}
          onBurn={props.onBurn}
        />

        <StatusBar status={props.status} progress={props.progress} />

        <CueList
          cues={props.cues}
          activeCueId={props.activeCueId}
          videoCurrentTime={props.videoCurrentTime}
          onUpdate={props.onCueUpdate}
          onDelete={props.onCueDelete}
          onJump={props.onJump}
        />

        <Hint>
          <b>Burn into video</b> is done by ffmpeg on the backend. <b>Soft</b> adds a fast,
          lossless, toggleable subtitle track (recommended). <b>Hard</b> permanently draws the
          captions onto the picture (needs an ffmpeg built with libass). Output is an{' '}
          <code>.mp4</code>. Or export an <code>.srt</code> to keep captions separate and editable.
        </Hint>
      </PanelBody>
    </Panel>
  );
}
