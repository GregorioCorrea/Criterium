export interface OKR {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: 'draft' | 'active' | 'closed';
}

export interface KeyResult {
  id: string;
  okrId: string;
  title: string;
  metricName?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  status: 'planned' | 'in_progress' | 'done';
}
