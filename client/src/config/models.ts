export type ModelOption = {
  value: string;
  label: string;
  isEnglishOnly: boolean;
};

export const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  { value: 'Xenova/whisper-tiny.en',  label: 'English · fast',    isEnglishOnly: true  },
  { value: 'Xenova/whisper-base.en',  label: 'English · accurate', isEnglishOnly: true  },
  { value: 'Xenova/whisper-small.en', label: 'English · best',    isEnglishOnly: true  },
  { value: 'Xenova/whisper-base',     label: 'Other languages',   isEnglishOnly: false },
];

export const DEFAULT_MODEL = 'Xenova/whisper-base.en';
