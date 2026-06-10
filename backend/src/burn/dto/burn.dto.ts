export interface BurnBody {
  srt?: string;
  mode?: 'soft' | 'hard' | string;
  fontSize?: string | number;
  pos?: string | number;
  weight?: string | number;
  boxOpacity?: string | number;
  videoWidth?: string | number;
  color?: string;
  outline?: string;
}
