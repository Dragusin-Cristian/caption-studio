export function downloadText(name: string, text: string, mimeType: string): void {
  downloadBlob(name, new Blob([text], { type: mimeType }));
}

export function downloadBlob(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function baseName(file: File | null): string {
  return file ? file.name.replace(/\.[^.]+$/, '') : 'subtitles';
}
