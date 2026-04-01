use chrono::{DateTime, Duration, Local, LocalResult, NaiveTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CronJob {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub thread_id: String,
    pub agent_id: Option<String>,
    pub enabled: bool,
    pub schedule_kind: String,
    pub interval_minutes: Option<u64>,
    pub daily_time: Option<String>,
    pub timezone: Option<String>,
    pub next_run_at: Option<String>,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn next_id(prefix: &str) -> String {
    format!("{}-{}", prefix, Utc::now().timestamp_millis())
}

fn read_cron_jobs() -> Result<Vec<CronJob>, String> {
    let hub = super::config::read_hub_config()?;
    Ok(
        hub.get("cronJobs")
            .and_then(|value| serde_json::from_value::<Vec<CronJob>>(value.clone()).ok())
            .unwrap_or_default(),
    )
}

fn write_cron_jobs(cron_jobs: &[CronJob]) -> Result<(), String> {
    super::config::write_hub_config_module(
        "cronJobs".to_string(),
        serde_json::to_value(cron_jobs)
            .map_err(|error| format!("Failed to serialize cron jobs: {}", error))?,
    )
}

fn parse_iso(value: &str) -> Option<DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn resolve_local_datetime(local_time: chrono::NaiveDateTime) -> DateTime<Local> {
    match Local.from_local_datetime(&local_time) {
        LocalResult::Single(value) => value,
        LocalResult::Ambiguous(first, _) => first,
        LocalResult::None => Utc.from_utc_datetime(&local_time).with_timezone(&Local),
    }
}

fn compute_next_run(job: &CronJob, reference: DateTime<Utc>) -> Option<DateTime<Utc>> {
    if !job.enabled {
        return None;
    }

    match job.schedule_kind.as_str() {
        "interval" => {
            let minutes = job.interval_minutes.unwrap_or(0);
            if minutes == 0 {
                return None;
            }
            Some(reference + Duration::minutes(minutes as i64))
        }
        "daily" => {
            let daily_time = job.daily_time.as_deref().unwrap_or("09:00");
            let parsed = NaiveTime::parse_from_str(daily_time, "%H:%M").ok()?;
            let local_reference = reference.with_timezone(&Local);
            let mut local_date = local_reference.date_naive();
            let today = resolve_local_datetime(local_date.and_time(parsed));
            if today <= local_reference {
                local_date = local_date.succ_opt()?;
            }
            Some(resolve_local_datetime(local_date.and_time(parsed)).with_timezone(&Utc))
        }
        _ => None,
    }
}

fn ensure_next_run(job: &mut CronJob, reference: DateTime<Utc>) {
    if !job.enabled {
        job.next_run_at = None;
        return;
    }

    let next = job
        .next_run_at
        .as_deref()
        .and_then(parse_iso)
        .or_else(|| compute_next_run(job, reference));
    job.next_run_at = next.map(|value| value.to_rfc3339());
}

#[tauri::command]
pub fn list_cron_jobs() -> Result<Vec<CronJob>, String> {
    let mut jobs = read_cron_jobs()?;
    let now = Utc::now();
    for job in jobs.iter_mut() {
        ensure_next_run(job, now);
    }
    write_cron_jobs(&jobs)?;
    Ok(jobs)
}

#[tauri::command]
pub fn upsert_cron_job(mut job: CronJob) -> Result<CronJob, String> {
    if job.title.trim().is_empty() {
        return Err("Cron job title cannot be empty".to_string());
    }
    if job.thread_id.trim().is_empty() {
        return Err("Cron job thread_id cannot be empty".to_string());
    }

    let now = Utc::now();
    let now_iso = now.to_rfc3339();
    let mut jobs = read_cron_jobs()?;

    if job.id.trim().is_empty() {
        job.id = next_id("cron");
        job.created_at = now_iso.clone();
    }
    job.updated_at = now_iso;
    ensure_next_run(&mut job, now);

    if let Some(index) = jobs.iter().position(|existing| existing.id == job.id) {
        jobs[index] = job.clone();
    } else {
        jobs.push(job.clone());
    }

    write_cron_jobs(&jobs)?;
    Ok(job)
}

#[tauri::command]
pub fn delete_cron_job(id: String) -> Result<(), String> {
    let jobs = read_cron_jobs()?;
    let filtered = jobs
        .into_iter()
        .filter(|job| job.id != id)
        .collect::<Vec<_>>();
    write_cron_jobs(&filtered)
}

#[tauri::command]
pub fn run_cron_job_now(id: String) -> Result<CronJob, String> {
    let mut jobs = read_cron_jobs()?;
    let index = jobs
        .iter()
        .position(|job| job.id == id)
        .ok_or_else(|| format!("Cron job not found: {}", id))?;

    let updated = trigger_job(&mut jobs[index])?;
    write_cron_jobs(&jobs)?;
    Ok(updated)
}

#[tauri::command]
pub fn poll_cron_jobs() -> Result<Vec<CronJob>, String> {
    let mut jobs = read_cron_jobs()?;
    let now = Utc::now();
    let mut triggered = Vec::new();

    for job in jobs.iter_mut() {
        ensure_next_run(job, now);
        let due = job
            .enabled
            && job
                .next_run_at
                .as_deref()
                .and_then(parse_iso)
                .map(|value| value <= now)
                .unwrap_or(false);

        if due {
            triggered.push(trigger_job(job)?);
        }
    }

    if !triggered.is_empty() {
        write_cron_jobs(&jobs)?;
    }

    Ok(triggered)
}

fn trigger_job(job: &mut CronJob) -> Result<CronJob, String> {
    let now = Utc::now();
    let body = if job.prompt.trim().is_empty() {
        "定时任务已触发，请继续执行预设动作。".to_string()
    } else {
        job.prompt.clone()
    };

    let task = super::collaboration::create_board_task(
        job.thread_id.clone(),
        job.title.clone(),
        body.clone(),
        job.agent_id.clone(),
        Some("medium".to_string()),
    )?;

    let _ = super::collaboration::record_thread_event(
        job.thread_id.clone(),
        "cron_triggered".to_string(),
        format!("定时任务已触发：{}", job.title),
        Some(body),
        job.agent_id.clone(),
        None,
        Some(task.id.clone()),
        Some(json!({
            "cron_job_id": job.id,
            "schedule_kind": job.schedule_kind,
        })),
    );

    job.last_run_at = Some(now.to_rfc3339());
    job.last_status = Some("triggered".to_string());
    job.updated_at = now.to_rfc3339();
    job.next_run_at = compute_next_run(job, now).map(|value| value.to_rfc3339());

    Ok(job.clone())
}
