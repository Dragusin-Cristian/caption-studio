import styled from 'styled-components';
import { Button } from '@/design-system/primitives/Button';
import { Select } from '@/design-system/primitives/Select';
import type { BurnMode } from '@/types';

const Row = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

type Props = {
  canExport: boolean;
  burnMode: BurnMode;
  burnBusy: boolean;
  onBurnModeChange: (mode: BurnMode) => void;
  onExportSrt: () => void;
  onExportVtt: () => void;
  onBurn: () => void;
};

export function ExportBar({
  canExport,
  burnMode,
  burnBusy,
  onBurnModeChange,
  onExportSrt,
  onExportVtt,
  onBurn,
}: Props) {
  return (
    <Row>
      <Button $variant="ghost" type="button" disabled={!canExport} onClick={onExportSrt}>
        Export .srt
      </Button>
      <Button $variant="ghost" type="button" disabled={!canExport} onClick={onExportVtt}>
        Export .vtt
      </Button>
      <Select
        title="Soft = fast, toggleable track. Hard = permanently drawn on the picture."
        value={burnMode}
        onChange={(e) => onBurnModeChange(e.target.value as BurnMode)}
      >
        <option value="soft">Soft subtitles (fast)</option>
        <option value="hard">Hard burn-in</option>
      </Select>
      <Button
        $variant="danger"
        type="button"
        disabled={!canExport || burnBusy}
        onClick={onBurn}
      >
        Burn into video
      </Button>
    </Row>
  );
}
