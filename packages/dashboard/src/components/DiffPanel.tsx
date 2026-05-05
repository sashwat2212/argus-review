import { useEffect, useRef } from 'react';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { extractFileDiff, findingLineRange } from '../lib/parseDiff';
import type { Finding } from '../api/types';

interface DiffPanelProps {
  rawDiff: string | null;
  finding: Finding | null;
}

export function DiffPanel({ rawDiff, finding }: DiffPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const fileDiff = rawDiff && finding
    ? extractFileDiff(rawDiff, finding.file_path)
    : '';

  const diffHtml = fileDiff
    ? diff2html(fileDiff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: 'line-by-line',
      })
    : '';

  useEffect(() => {
    if (!containerRef.current || !finding || !diffHtml) return;
    const container = containerRef.current;
    const lineNums = findingLineRange(finding);
    let firstRow: HTMLElement | null = null;

    container.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => {
      row.classList.remove('argus-highlight');
      const lineNumEl = row.querySelector<HTMLElement>('.line-num2');
      if (!lineNumEl) return;
      const lineNum = parseInt(lineNumEl.textContent ?? '', 10);
      if (!isNaN(lineNum) && lineNums.has(lineNum)) {
        row.classList.add('argus-highlight');
        if (!firstRow) firstRow = row;
      }
    });

    (firstRow as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [diffHtml, finding]);

  if (!rawDiff) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm px-4 text-center">
        No diff stored for this review
      </div>
    );
  }

  if (!finding) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a finding to view the diff
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm font-mono px-4 text-center">
        Diff not available for {finding.file_path}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto text-xs argus-diff"
      dangerouslySetInnerHTML={{ __html: diffHtml }}
    />
  );
}
