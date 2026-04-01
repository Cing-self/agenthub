use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// Get the path to openclaw.json
fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let path = home.join(".openclaw").join("openclaw.json");
    Ok(path)
}

/// Read the entire config from a given path (or default ~/.openclaw/openclaw.json)
#[tauri::command]
pub fn read_config(config_file: Option<String>) -> Result<Value, String> {
    let path = match config_file {
        Some(p) => PathBuf::from(p),
        None => config_path()?,
    };
    if !path.exists() {
        return Err(format!("Config file not found: {}", path.display()));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let value: Value =
        json5::from_str(&content).map_err(|e| format!("Failed to parse JSON5: {}", e))?;
    Ok(value)
}

/// Read a specific module from the config (e.g., "agents", "channels")
#[tauri::command]
pub fn read_config_module(module: String, config_file: Option<String>) -> Result<Value, String> {
    let config = read_config(config_file)?;
    match config.get(&module) {
        Some(value) => Ok(value.clone()),
        None => Ok(Value::Null),
    }
}

/// Write a specific module back to the config (merge)
#[tauri::command]
pub fn write_config_module(module: String, data: Value) -> Result<(), String> {
    let path = config_path()?;

    // Read current config
    let content = if path.exists() {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?
    } else {
        "{}".to_string()
    };

    let mut config: Value =
        json5::from_str(&content).map_err(|e| format!("Failed to parse JSON5: {}", e))?;

    // Merge module data
    if let Value::Object(ref mut map) = config {
        map.insert(module, data);
    } else {
        return Err("Config root is not an object".to_string());
    }

    // Create backup before writing
    if path.exists() {
        let _ = super::backup::create_backup_internal(&path);
    }

    // Atomic write: write to temp file then rename
    let dir = path
        .parent()
        .ok_or("Cannot determine config directory")?;
    let tmp = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let json_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(tmp.path(), &json_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    tmp.persist(&path)
        .map_err(|e| format!("Failed to persist config: {}", e))?;

    Ok(())
}

/// Get the config file path as a string
#[tauri::command]
pub fn get_config_path() -> Result<String, String> {
    let path = config_path()?;
    Ok(path.to_string_lossy().to_string())
}

// ── AgentHub own config (~/.agenthub/hub.json) ──

fn hub_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".agenthub");
    // Ensure directory exists
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create .agenthub dir: {}", e))?;
    }
    Ok(dir.join("hub.json"))
}

/// Read the entire hub.json config
#[tauri::command]
pub fn read_hub_config() -> Result<Value, String> {
    let path = hub_config_path()?;
    if !path.exists() {
        // Return default empty structure (new format: providers and models are separate top-level arrays)
        return Ok(serde_json::json!({
            "providers": [],
            "models": [],
            "mcpServers": [],
            "secrets": [],
            "customAgents": [
                {
                    "id": "dolphin",
                    "name": "dolphin",
                    "icon": "🐬",
                    "runtime_profile": {
                        "runtime_family": "claude-code",
                        "auth_source": "claude-subscription",
                        "default_model": null
                    }
                }
            ],
            "skills": { "directories": [] },
            "memory": {
                "provider": "memos",
                "enabled": false,
                "base_url": "",
                "access_token": null
            },
            "collaboration": {
                "connectors": [],
                "threads": [],
                "boards": [],
                "tasks": [],
                "sessions": [],
                "events": [],
                "routes": []
            }
        }));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read hub config: {}", e))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse hub config: {}", e))?;
    Ok(value)
}

/// Write a specific module to hub.json (merge)
#[tauri::command]
pub fn write_hub_config_module(module: String, data: Value) -> Result<(), String> {
    let path = hub_config_path()?;

    let content = if path.exists() {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read hub config: {}", e))?
    } else {
        r#"{"providers":[],"models":[],"mcpServers":[],"secrets":[],"customAgents":[{"id":"dolphin","name":"dolphin","icon":"🐬","runtime_profile":{"runtime_family":"claude-code","auth_source":"claude-subscription","default_model":null}}],"skills":{"directories":[]},"memory":{"provider":"memos","enabled":false,"base_url":"","access_token":null},"collaboration":{"connectors":[],"threads":[],"boards":[],"tasks":[],"sessions":[],"events":[],"routes":[]}}"#.to_string()
    };

    let mut config: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse hub config: {}", e))?;

    if let Value::Object(ref mut map) = config {
        map.insert(module, data);
    } else {
        return Err("Hub config root is not an object".to_string());
    }

    // Atomic write
    let dir = path.parent().ok_or("Cannot determine hub config directory")?;
    let tmp = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let json_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize hub config: {}", e))?;

    fs::write(tmp.path(), &json_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    tmp.persist(&path)
        .map_err(|e| format!("Failed to persist hub config: {}", e))?;

    Ok(())
}
