import styled from 'styled-components';
import { Panel, PanelHeader, PanelBody } from '@/design-system/primitives/Panel';
import { Slider } from '@/design-system/primitives/Slider';
import { ColorSwatch, ColorRow, ColorValue } from '@/design-system/primitives/ColorInput';
import { SegmentedControl } from '@/design-system/primitives/SegmentedControl';
import { SIZE_RANGE, POS_RANGE, BOX_RANGE } from '@/config/defaults';
import type { CaptionStyle } from '@/types';

const Controls = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 13px 18px;
  margin-top: 4px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  letter-spacing: .04em;
`;

const WEIGHT_OPTIONS = [
  { value: 500 as const, label: 'Regular' },
  { value: 700 as const, label: 'Bold' },
];

const OUTLINE_OPTIONS = [
  { value: 0 as const, label: 'Off' },
  { value: 1 as const, label: 'On' },
];

type Props = {
  value: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
};

export function CaptionStylePanel({ value, onChange }: Props) {
  return (
    <Panel>
      <PanelHeader>Caption style</PanelHeader>
      <PanelBody>
        <Controls>
          <Field>
            <Label>Text size</Label>
            <Slider
              min={SIZE_RANGE.min}
              max={SIZE_RANGE.max}
              step={SIZE_RANGE.step}
              value={value.size}
              onChange={(e) => onChange({ size: Number(e.target.value) })}
            />
          </Field>

          <Field>
            <Label>Position from bottom</Label>
            <Slider
              min={POS_RANGE.min}
              max={POS_RANGE.max}
              step={POS_RANGE.step}
              value={value.pos}
              onChange={(e) => onChange({ pos: Number(e.target.value) })}
            />
          </Field>

          <Field>
            <Label>Text colour</Label>
            <ColorRow>
              <ColorSwatch
                value={value.color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
              <ColorValue>{value.color}</ColorValue>
            </ColorRow>
          </Field>

          <Field>
            <Label>Box opacity</Label>
            <Slider
              min={BOX_RANGE.min}
              max={BOX_RANGE.max}
              step={BOX_RANGE.step}
              value={value.box}
              onChange={(e) => onChange({ box: Number(e.target.value) })}
            />
          </Field>

          <Field>
            <Label>Weight</Label>
            <SegmentedControl
              options={WEIGHT_OPTIONS}
              value={value.weight}
              onChange={(weight) => onChange({ weight })}
            />
          </Field>

          <Field>
            <Label>Outline</Label>
            <SegmentedControl
              options={OUTLINE_OPTIONS}
              value={value.outline}
              onChange={(outline) => onChange({ outline })}
            />
          </Field>
        </Controls>
      </PanelBody>
    </Panel>
  );
}
