import styled from 'styled-components';
import { useRef } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Select } from '@/design-system/primitives/Select';
import { TextInput } from '@/design-system/primitives/TextInput';
import { MODEL_OPTIONS } from '@/config/models';

const Row = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

const LangInput = styled(TextInput)`
  width: 130px;
`;

const HiddenInput = styled.input`
  display: none;
`;

type Props = {
  model: string;
  onModelChange: (next: string) => void;
  language: string;
  onLanguageChange: (next: string) => void;
  onAutoTranscribe: () => void;
  autoBusy: boolean;
  onAddLine: () => void;
  canAddLine: boolean;
  onImport: (file: File) => void;
};

export function ActionsBar({
  model,
  onModelChange,
  language,
  onLanguageChange,
  onAutoTranscribe,
  autoBusy,
  onAddLine,
  canAddLine,
  onImport,
}: Props) {
  const subFileRef = useRef<HTMLInputElement>(null);
  const selected = MODEL_OPTIONS.find((m) => m.value === model);
  const langDisabled = selected ? selected.isEnglishOnly : true;

  return (
    <Row>
      <Button $variant="primary" type="button" disabled={autoBusy} onClick={onAutoTranscribe}>
        Auto-transcribe
      </Button>

      <Select
        title="Bigger = more accurate. Runs on the backend, not your browser."
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>

      <LangInput
        placeholder="lang e.g. spanish"
        title="Only for the 'Other languages' model. Leave blank to auto-detect."
        value={language}
        disabled={langDisabled}
        onChange={(e) => onLanguageChange(e.target.value)}
      />

      <Button type="button" onClick={onAddLine} disabled={!canAddLine}>
        Add line
      </Button>

      <Button type="button" onClick={() => subFileRef.current?.click()}>
        Import .srt / .vtt
      </Button>
      <HiddenInput
        ref={subFileRef}
        type="file"
        accept=".srt,.vtt,text/plain"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />
    </Row>
  );
}
