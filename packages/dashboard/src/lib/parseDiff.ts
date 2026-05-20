import type { Finding } from '../api/types';

/**
 * Extracts the diff section for a single file from a full unified diff.
 * Returns empty string if the file is not found in the diff.
 */
export function extractFileDiff(rawDiff: string, filePath: string): string {
  const sections = rawDiff.split(/(?=^diff --git )/m);
  return sections.find(s => s.includes(`+++ b/${filePath}`)) ?? '';
}

/**
 * Returns the set of new-file line numbers covered by a finding (inclusive).
 */
export function findingLineRange(finding: Finding): Set<number> {
  const lines = new Set<number>();
  for (let i = finding.line_start; i <= finding.line_end; i++) {
    lines.add(i);
  }
  return lines;
}
