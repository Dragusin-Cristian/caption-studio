import styled from 'styled-components';

export type Segment<V extends string | number> = { value: V; label: string };

type Props<V extends string | number> = {
  options: ReadonlyArray<Segment<V>>;
  value: V;
  onChange: (next: V) => void;
};

const Group = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.sm};
  overflow: hidden;
`;

const SegButton = styled.button<{ $on: boolean }>`
  background: ${({ $on, theme }) => ($on ? theme.colors.accent : theme.colors.surface2)};
  color: ${({ $on, theme }) => ($on ? theme.colors.accentOn : theme.colors.muted)};
  font-weight: ${({ $on }) => ($on ? 600 : 400)};
  border: 0;
  padding: 6px 11px;
  cursor: pointer;
  font-size: 13px;
`;

export function SegmentedControl<V extends string | number>({ options, value, onChange }: Props<V>) {
  return (
    <Group role="group">
      {options.map((opt) => (
        <SegButton
          key={String(opt.value)}
          type="button"
          $on={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </SegButton>
      ))}
    </Group>
  );
}
