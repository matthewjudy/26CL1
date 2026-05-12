export interface Goal {
  id: string;
  title: string;
  description?: string;
  progress: number;       // 0.0 – 1.0
  targetValue?: number;
  currentValue?: number;
  dueDate?: string;       // ISO date
}

export interface Initiative {
  id: string;
  goalId: string;
  title: string;
  status: 'active' | 'completed' | 'paused';
  owner?: string;
}

export interface Task {
  id: string;
  initiativeId?: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  dueDate?: string;
  assignee?: string;
}

export interface IntakePayload {
  jobName: string;
  data: Record<string, unknown>;
  goalId?: string;
  initiativeId?: string;
  runAt?: string;         // ISO timestamp
}

export interface IntakeResult {
  id: string;
}
