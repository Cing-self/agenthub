export type CronScheduleKind = "interval" | "daily";

export interface CronJob {
  id: string;
  title: string;
  prompt: string;
  thread_id: string;
  agent_id?: string | null;
  enabled: boolean;
  schedule_kind: CronScheduleKind;
  interval_minutes?: number | null;
  daily_time?: string | null;
  timezone?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  created_at: string;
  updated_at: string;
}
