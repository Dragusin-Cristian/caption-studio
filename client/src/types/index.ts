export type Cue = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type CaptionStyle = {
  size: number;
  pos: number;
  color: string;
  box: number;
  weight: 500 | 700;
  outline: number;
};

export type StatusKind = '' | 'work' | 'err' | 'ok';

export type Status = {
  kind: StatusKind;
  message: string;
};

export type BurnMode = 'soft' | 'hard';

export type Job = {
  status: string;
  progress?: number;
  segments?: number;
  result?: { cues: Cue[]; srt: string; vtt: string };
  error?: string;
};
