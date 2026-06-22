export type LanguageOption = {
  value: string;
  label: string;
};

// The only languages offered across the app. `value` is the ISO 639-1 code
// sent to the backend; the orchestrator routes `en` to the small.en worker and
// everything else to the multilingual base worker.
export const LANGUAGE_OPTIONS: ReadonlyArray<LanguageOption> = [
  { value: 'en', label: 'English'  },
  { value: 'es', label: 'Spanish'  },
  { value: 'de', label: 'German'   },
  { value: 'ro', label: 'Romanian' },
  { value: 'fr', label: 'French'   },
  { value: 'it', label: 'Italian'  },
];

export const DEFAULT_LANGUAGE = 'en';
