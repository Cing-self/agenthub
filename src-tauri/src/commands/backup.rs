use chrono::Local;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_BACKUPS: usize = 20;

#[derive(Serialize)]
pub struct BackupInfo {
    pub filename: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

/// Internal backup function (called by config write)
pub fn create_backup_internal(config_path: &Path) -> Result<PathBuf, String> {
    let backup_dir = config_path
        .parent()
        .ok_or("Cannot determine config directory")?
        .join("backups");

    // Ensure backup directory exists
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Create backup with timestamp
    let timestamp = Local::now().format("%Y-%m-%dT%H-%M-%S");
    let backup_filename = format!("openclaw.{}.json", timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    fs::copy(config_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    // Clean up old backups (keep only MAX_BACKUPS)
    cleanup_old_backups(&backup_dir)?;

    Ok(backup_path)
}

/// Cleanup old backups, keeping only the most recent MAX_BACKUPS
fn cleanup_old_backups(backup_dir: &Path) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("openclaw.") && n.ends_with(".json"))
                .unwrap_or(false)
        })
        .collect();

    // Sort by modification time (newest first)
    entries.sort_by(|a, b| {
        let a_time = a.metadata().and_then(|m| m.modified()).ok();
        let b_time = b.metadata().and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    // Remove old backups
    for entry in entries.iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

/// Create a manual backup
#[tauri::command]
pub fn create_backup() -> Result<BackupInfo, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let config_path = home.join(".openclaw").join("openclaw.json");

    if !config_path.exists() {
        return Err("Config file not found".to_string());
    }

    let backup_path = create_backup_internal(&config_path)?;
    let metadata = fs::metadata(&backup_path)
        .map_err(|e| format!("Failed to read backup metadata: {}", e))?;

    Ok(BackupInfo {
        filename: backup_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: backup_path.to_string_lossy().to_string(),
        created_at: Local::now().to_rfc3339(),
        size_bytes: metadata.len(),
    })
}

/// List all available backups
#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let backup_dir = home.join(".openclaw").join("backups");

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("openclaw.") && n.ends_with(".json"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let metadata = e.metadata().ok()?;
            Some(BackupInfo {
                filename: e.file_name().to_string_lossy().to_string(),
                path: e.path().to_string_lossy().to_string(),
                created_at: metadata
                    .modified()
                    .ok()
                    .map(|t| {
                        chrono::DateTime::<Local>::from(t).to_rfc3339()
                    })
                    .unwrap_or_default(),
                size_bytes: metadata.len(),
            })
        })
        .collect();

    // Sort newest first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}
