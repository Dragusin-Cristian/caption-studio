import styled from 'styled-components';
import { useEffect, useState } from 'react';
import { TextInput } from '@/design-system/primitives/TextInput';
import { Textarea } from '@/design-system/primitives/Textarea';
import { MiniButton } from '@/design-system/primitives/MiniButton';
import { fmtClock, parseClock } from '@/lib/time';
import type { Cue } from '@/types';

const Row = styled.div<{ $active: boolean }>`
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.accent : theme.colors.line)};
  box-shadow: ${({ $active, theme }) =>
    $active ? `0 0 0 1px ${theme.colors.accent} inset` : 'none'};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 10px;
  background: ${({ theme }) => theme.colors.surface2};
`;

const Times = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
`;

const TimeInput = styled(TextInput)`
  width: 108px;
  text-align: center;
`;

const Arrow = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`;

const Spacer = styled.span`
  margin-left: auto;
  display: flex;
  gap: 6px;
`;

type Props = {
  cue: Cue;
  active: boolean;
  videoCurrentTime: number;
  onUpdate: (patch: Partial<Omit<Cue, 'id'>>) => void;
  onDelete: () => void;
  onJump: (time: number) => void;
};

export function CueRow({ cue, active, videoCurrentTime, onUpdate, onDelete, onJump }: Props) {
  const [startStr, setStartStr] = useState(() => fmtClock(cue.start));
  const [endStr, setEndStr] = useState(() => fmtClock(cue.end));

  useEffect(() => { setStartStr(fmtClock(cue.start)); }, [cue.start]);
  useEffect(() => { setEndStr(fmtClock(cue.end)); }, [cue.end]);

  const commitStart = () => {
    const v = parseClock(startStr);
    if (v == null) { setStartStr(fmtClock(cue.start)); return; }
    onUpdate({ start: v });
  };
  const commitEnd = () => {
    const v = parseClock(endStr);
    if (v == null) { setEndStr(fmtClock(cue.end)); return; }
    onUpdate({ end: v });
  };

  return (
    <Row $active={active}>
      <Times>
        <TimeInput
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
          onBlur={commitStart}
        />
        <Arrow>→</Arrow>
        <TimeInput
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
          onBlur={commitEnd}
        />
        <MiniButton
          type="button"
          title="Set start to playhead"
          onClick={() => onUpdate({ start: videoCurrentTime })}
        >
          ⤓ in
        </MiniButton>
        <MiniButton
          type="button"
          title="Set end to playhead"
          onClick={() => onUpdate({ end: videoCurrentTime })}
        >
          ⤓ out
        </MiniButton>
        <MiniButton type="button" title="Jump video here" onClick={() => onJump(cue.start)}>
          ▶
        </MiniButton>
        <Spacer>
          <MiniButton type="button" title="Delete line" onClick={onDelete}>
            ✕
          </MiniButton>
        </Spacer>
      </Times>
      <Textarea
        rows={2}
        placeholder="Caption text…"
        value={cue.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
      />
    </Row>
  );
}
