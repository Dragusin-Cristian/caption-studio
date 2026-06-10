import type { CaptionStyle, BurnMode } from '@/types';

export const DEFAULT_STYLE: CaptionStyle = {
  size: 4.2,
  pos: 8,
  color: '#f4c95d',
  box: 62,
  weight: 700,
  outline: 0,
};

export const DEFAULT_BURN_MODE: BurnMode = 'soft';

export const SIZE_RANGE   = { min: 2, max: 9,  step: 0.25 } as const;
export const POS_RANGE    = { min: 2, max: 45, step: 1    } as const;
export const BOX_RANGE    = { min: 0, max: 100, step: 5   } as const;

export const NEW_CUE_DURATION = 2; // seconds added after the playhead for a fresh line
export const POLL_INTERVAL_MS = 700;
