// A deliberately small teaching system, not Lerience's course-file scanner.
// The path format is <source>/<YYYY-MM>.csv. File contents are opaque here.
export function scanFilings(paths: readonly string[], read: (path: string) => string) {
  const accepted: { path: string; contents: string }[] = [];
  const filingErrors: string[] = [];
  for (const path of paths) {
    if (!/^[a-z]+\/\d{4}-(0[1-9]|1[0-2])\.csv$/.test(path)) {
      filingErrors.push(path);
      continue;
    }
    accepted.push({ path, contents: read(path) });
  }
  return { accepted, filingErrors };
}
