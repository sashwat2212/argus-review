export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ReviewStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Finding {
  id: string;
  review_id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  severity: Severity;
  category: string;
  confidence: number;
  title: string;
  description: string;
  why_it_matters: string;
  suggested_fix: string;
  agent: string;
  is_resolved: boolean;
}

export interface Review {
  id: string;
  repo_id: string;
  trigger_type: string;
  pr_number: number | null;
  pr_title: string | null;
  base_sha: string | null;
  head_sha: string | null;
  status: ReviewStatus;
  score: number | null;
  total_findings: number;
  started_at: string | null;
  completed_at: string | null;
  findings: Finding[];
}

export interface ReviewListOut {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
}
