import styled from 'styled-components';
import { CueRow } from './CueRow';
import type { Cue } from '@/types';

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  margin-bottom: 12px;
`;

const Count = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-left: auto;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 560px;
  overflow: auto;
  padding-right: 4px;
`;

const Empty = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  padding: 34px 10px;
  font-size: 14px;

  code {
    font-family: ${({ theme }) => theme.fonts.mono};
    color: ${({ theme }) => theme.colors.accentDim};
  }
`;

type Props = {
  cues: ReadonlyArray<Cue>;
  activeCueId: number | null;
  videoCurrentTime: number;
  onUpdate: (id: number, patch: Partial<Omit<Cue, 'id'>>) => void;
  onDelete: (id: number) => void;
  onJump: (time: number) => void;
};

export function CueList({ cues, activeCueId, videoCurrentTime, onUpdate, onDelete, onJump }: Props) {
  return (
    <>
      <Head>
        <Count>{cues.length === 1 ? '1 line' : `${cues.length} lines`}</Count>
      </Head>
      <List>
        {cues.length === 0 ? (
          <Empty>
            No subtitles yet.<br />
            Hit <code>Auto-transcribe</code> to generate them from the audio, or{' '}
            <code>Add line</code> to write your own.
          </Empty>
        ) : (
          cues.map((q) => (
            <CueRow
              key={q.id}
              cue={q}
              active={q.id === activeCueId}
              videoCurrentTime={videoCurrentTime}
              onUpdate={(patch) => onUpdate(q.id, patch)}
              onDelete={() => onDelete(q.id)}
              onJump={onJump}
            />
          ))
        )}
      </List>
    </>
  );
}
