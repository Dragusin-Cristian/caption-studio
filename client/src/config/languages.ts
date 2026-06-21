export type LanguageOption = {
  value: string;
  label: string;
};

// The only languages offered across the app. `value` is sent to the backend
// (whisper accepts the lowercase language name).
export const LANGUAGE_OPTIONS: ReadonlyArray<LanguageOption> = [
  { value: 'english',  label: 'English'  },
  { value: 'spanish',  label: 'Spanish'  },
  { value: 'german',   label: 'German'   },
  { value: 'romanian', label: 'Romanian' },
  { value: 'french',   label: 'French'   },
  { value: 'italian',  label: 'Italian'  },
];

export const DEFAULT_LANGUAGE = 'english';
