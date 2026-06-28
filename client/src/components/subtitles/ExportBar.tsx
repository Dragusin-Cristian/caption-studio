import { useState } from 'react';
import styled from 'styled-components';
import { Button } from '@/design-system/primitives/Button';

const Row = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

type Props = {
  canExport: boolean;
  burnBusy: boolean;
  linkedInPrompt: string;
  onExportSrt: () => void;
  onExportVtt: () => void;
  onBurn: () => void;
};

export function ExportBar({
  canExport,
  burnBusy,
  linkedInPrompt,
  onExportSrt,
  onExportVtt,
  onBurn,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyLinkedIn = async () => {
    try {
      await navigator.clipboard.writeText(linkedInPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; silently ignore
    }
  };

  return (
    <Row>
      <Button $variant="ghost" type="button" disabled={!canExport} onClick={onExportSrt}>
        Export .srt
      </Button>
      <Button $variant="ghost" type="button" disabled={!canExport} onClick={onExportVtt}>
        Export .vtt
      </Button>
      <Button
        $variant="ghost"
        type="button"
        disabled={!canExport}
        onClick={handleCopyLinkedIn}
        title="Copies the transcript prefixed with a prompt asking Claude to write a LinkedIn post."
      >
        {copied ? 'Copied!' : 'Copy LinkedIn prompt'}
      </Button>
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
