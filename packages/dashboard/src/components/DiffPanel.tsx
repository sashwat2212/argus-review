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

    if (firstRow) {
      setTimeout(() => {
        (firstRow as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [diffHtml, finding]);

  if (!rawDiff) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm px-4 text-center">
        No diff stored for this review
      </div>
    );
  }

  if (!finding) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Select a finding to view the diff
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm font-mono px-4 text-center">
        Diff not available for {finding.file_path}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sticky File Header */}
      <div className="sticky top-0 z-10 px-4 py-2 border-b border-white/5 shadow-sm backdrop-blur-md" style={{ background: 'rgba(24, 24, 27, 0.8)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">File</span>
          <code className="text-xs font-mono text-zinc-300">{finding.file_path}</code>
        </div>
      </div>
      
      {/* Scrollable Diff Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto text-xs argus-diff"
        dangerouslySetInnerHTML={{ __html: diffHtml }}
      />
    </div>
  );
}

