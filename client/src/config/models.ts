export type ModelOption = {
  value: string;
  label: string;
  isEnglishOnly: boolean;
};

export const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  { value: 'Xenova/whisper-small.en', label: 'English',    isEnglishOnly: true  },
  { value: 'Xenova/whisper-base',     label: 'Other languages',   isEnglishOnly: false },
];

export const DEFAULT_MODEL = 'Xenova/whisper-small.en';
