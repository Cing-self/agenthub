use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use tauri::Emitter;

#[derive(Serialize)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub json: Option<serde_json::Value>,
}

fn escape_for_applescript(command: &str) -> String {
    command
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
}

#[derive(Deserialize)]
struct CustomRuntimeProfileConfig {
    runtime_family: String,
}

#[derive(Deserialize)]
struct CustomAgentConfig {
    id: String,
    runtime_profile: CustomRuntimeProfileConfig,
}

fn with_augmented_path(cmd: &mut Command) {
    if let Some(home) = dirs::home_dir() {
        let npm_bin = home.join(".npm-global/bin");
        let brew_bin = std::path::PathBuf::from("/opt/homebrew/bin");
        let current_path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!(
                "{}:{}:{}",
                npm_bin.to_string_lossy(),
                brew_bin.to_string_lossy(),
                current_path
            ),
        );
    }
}


/// GitHub OAuth: open browser, listen for callback, exchange code for token
#[tauri::command]
pub async fn github_oauth_login(client_id: String, client_secret: String) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:19198")
        .map_err(|e| format!("Failed to bind: {}", e))?;

    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri=http://localhost:19198/callback&scope=read:user,user:email",
        client_id
    );

    #[cfg(target_os = "macos")]
    Command::new("open").arg(&auth_url).spawn().ok();
    #[cfg(target_os = "linux")]
    Command::new("xdg-open").arg(&auth_url).spawn().ok();

    let (mut stream, _) = listener.accept().map_err(|e| format!("No callback: {}", e))?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    let code = request.lines().next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|u| u.split("code=").nth(1).map(|c| c.split('&').next().unwrap_or(c).to_string()))
        .ok_or("No code in callback")?;

    let html = "<html><body style='font-family:system-ui;text-align:center;padding:60px'><h2>登录成功</h2><p>可以关闭此页面</p></body></html>";
    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type:text/html;charset=utf-8\r\nContent-Length:{}\r\n\r\n{}", html.len(), html);
    stream.write_all(resp.as_bytes()).ok();
    drop(stream);
    drop(listener);

    let client = reqwest::Client::new();
    let res = client.post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[("client_id", &client_id), ("client_secret", &client_secret), ("code", &code)])
        .send().await.map_err(|e| format!("Token exchange failed: {}", e))?;

    let data: serde_json::Value = res.json().await.map_err(|e| format!("Parse failed: {}", e))?;
    if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
        return Err(format!("GitHub: {}", err));
    }
    Ok(data)
}

/// Run a shell command and return output
#[tauri::command]
pub async fn run_shell_cmd(command: String, timeout_secs: Option<u64>) -> Result<CliResult, String> {
    let _timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(120));

    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(&command);
    with_augmented_path(&mut cmd);

    let output = cmd.output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(CliResult {
        stdout: stdout.clone(),
        stderr,
        success: output.status.success(),
        json: serde_json::from_str(&stdout).ok(),
    })
}

#[tauri::command]
pub async fn open_terminal_command(command: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            let escaped = escape_for_applescript(&command);
            Command::new("osascript")
                .arg("-e")
                .arg(format!("tell application \"Terminal\" to do script \"{}\"", escaped))
                .arg("-e")
                .arg("tell application \"Terminal\" to activate")
                .status()
                .map_err(|error| format!("Failed to open Terminal: {}", error))?;
            return Ok(());
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("sh")
                .arg("-c")
                .arg(format!("x-terminal-emulator -e '{}'; true", command))
                .status()
                .map_err(|error| format!("Failed to open terminal: {}", error))?;
            return Ok(());
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = command;
            return Err("Opening an interactive terminal is not supported on this platform".to_string());
        }
    })
    .await
    .map_err(|error| format!("Failed to run terminal launcher: {}", error))?
}

#[tauri::command]
pub async fn run_claude_sdk_cmd(window: tauri::Window, payload: serde_json::Value) -> Result<CliResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir
            .parent()
            .ok_or("Cannot determine project root")?
            .to_path_buf();
        let script_path = manifest_dir.join("scripts").join("claude-runtime.mjs");

        if !script_path.exists() {
            return Err(format!("Claude runtime script not found: {}", script_path.display()));
        }

        let mut cmd = Command::new("node");
        cmd.arg(script_path);
        cmd.current_dir(&project_root);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        with_augmented_path(&mut cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Claude SDK runtime: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let payload_str = serde_json::to_string(&payload)
                .map_err(|e| format!("Failed to serialize Claude runtime payload: {}", e))?;
            stdin
                .write_all(payload_str.as_bytes())
                .map_err(|e| format!("Failed to write Claude runtime payload: {}", e))?;
        }

        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture Claude runtime stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Failed to capture Claude runtime stderr")?;

        let stderr_handle = std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut buffer = String::new();
            let _ = reader.read_to_string(&mut buffer);
            buffer
        });

        let mut stdout_lines = Vec::new();
        let mut final_json: Option<serde_json::Value> = None;

        for line in BufReader::new(stdout).lines() {
            let line = line.map_err(|e| format!("Failed to read Claude runtime stdout: {}", e))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            stdout_lines.push(trimmed.to_string());

            let parsed = match serde_json::from_str::<serde_json::Value>(trimmed) {
                Ok(value) => value,
                Err(_) => continue,
            };

            match parsed.get("type").and_then(|value| value.as_str()) {
                Some("partial") => {
                    let _ = window.emit("agenthub://runtime-stream", &parsed);
                }
                Some("final") => {
                    if let Some(object) = parsed.as_object() {
                        let mut next = serde_json::Map::new();
                        for (key, value) in object {
                            if key != "type" {
                                next.insert(key.clone(), value.clone());
                            }
                        }
                        final_json = Some(serde_json::Value::Object(next));
                    } else {
                        final_json = Some(parsed);
                    }
                }
                _ => {
                    final_json = Some(parsed);
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed to wait for Claude SDK runtime: {}", e))?;

        let stderr = stderr_handle
            .join()
            .unwrap_or_else(|_| "Failed to join Claude runtime stderr reader".to_string());
        let stdout = stdout_lines.join("\n");

        Ok(CliResult {
            stdout: stdout.clone(),
            stderr,
            success: status.success(),
            json: final_json.or_else(|| serde_json::from_str(&stdout).ok()),
        })
    })
    .await
    .map_err(|e| format!("Claude SDK task join error: {}", e))?
}

/// Find the openclaw binary path
fn find_openclaw() -> Result<String, String> {
    // Check common locations
    let candidates = [
        dirs::home_dir()
            .map(|h| h.join(".npm-global/bin/openclaw").to_string_lossy().to_string()),
        Some("/usr/local/bin/openclaw".to_string()),
        Some("/opt/homebrew/bin/openclaw".to_string()),
    ];

    for candidate in candidates.iter().flatten() {
        if std::path::Path::new(candidate).exists() {
            return Ok(candidate.clone());
        }
    }

    // Try `which openclaw`
    let output = Command::new("which")
        .arg("openclaw")
        .output()
        .map_err(|e| format!("Failed to run 'which': {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(path);
        }
    }

    Err("openclaw CLI not found".to_string())
}

/// Run an openclaw CLI command and return the output.
/// `args` is a list of arguments (e.g. ["models", "list", "--json"]).
/// `config_path` optionally overrides the config file.
#[tauri::command]
pub async fn run_openclaw_cmd(
    args: Vec<String>,
    config_path: Option<String>,
) -> Result<CliResult, String> {
    let bin = find_openclaw()?;

    let mut cmd = Command::new(&bin);

    // Add HOME to PATH so node/npm are available
    if let Some(home) = dirs::home_dir() {
        let _ = home;
        with_augmented_path(&mut cmd);
    }

    // If a specific config path is given, set OPENCLAW_CONFIG_PATH
    if let Some(ref cp) = config_path {
        cmd.env("OPENCLAW_CONFIG_PATH", cp);
    }

    // Disable colors for clean parsing
    cmd.arg("--no-color");
    cmd.args(&args);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Try to parse stdout as JSON (strip ANSI and plugin log lines first)
    let clean_stdout: String = stdout
        .lines()
        .filter(|line| {
            !line.starts_with("[plugins]")
                && !line.contains("[plugins]")
                && !line.starts_with("\x1b[35m")
        })
        .collect::<Vec<_>>()
        .join("\n");

    let json = serde_json::from_str::<serde_json::Value>(&clean_stdout).ok();

    Ok(CliResult {
        stdout: clean_stdout,
        stderr,
        success: output.status.success(),
        json,
    })
}

/// Scan a directory for skill/plugin subdirectories with optional SKILL.md reading
#[tauri::command]
pub fn scan_directory_items(path: String, read_frontmatter: bool) -> Result<Vec<serde_json::Value>, String> {
    let dir = std::path::PathBuf::from(&path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut items = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }

        // Follow symlinks
        let entry_path = entry.path();
        let resolved = std::fs::canonicalize(&entry_path).unwrap_or(entry_path.clone());
        let is_dir = resolved.is_dir();

        if !is_dir { continue; }

        let mut item = serde_json::json!({
            "name": name,
            "path": resolved.to_string_lossy(),
            "isSymlink": entry_path.read_link().is_ok(),
        });

        if read_frontmatter {
            // Try to read SKILL.md frontmatter
            let skill_md = resolved.join("SKILL.md");
            if skill_md.exists() {
                if let Ok(content) = std::fs::read_to_string(&skill_md) {
                    // Parse YAML frontmatter between --- markers
                    let lines: Vec<&str> = content.lines().collect();
                    if lines.first() == Some(&"---") {
                        let mut description = String::new();
                        let mut fm_name = String::new();
                        for line in lines.iter().skip(1) {
                            if *line == "---" { break; }
                            if line.starts_with("description:") {
                                description = line.trim_start_matches("description:").trim().to_string();
                            }
                            if line.starts_with("name:") {
                                fm_name = line.trim_start_matches("name:").trim().to_string();
                            }
                        }
                        if !description.is_empty() {
                            item["description"] = serde_json::Value::String(description);
                        }
                        if !fm_name.is_empty() {
                            item["displayName"] = serde_json::Value::String(fm_name);
                        }
                    }
                }
            }
        }

        items.push(item);
    }

    // Sort by name
    items.sort_by(|a, b| {
        a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or(""))
    });

    Ok(items)
}

/// Recursively scan a directory tree and return structure + file metadata
#[tauri::command]
pub fn scan_directory_tree(path: String) -> Result<serde_json::Value, String> {
    fn scan(dir: &std::path::Path, depth: usize) -> serde_json::Value {
        if depth > 5 || !dir.exists() {
            return serde_json::json!([]);
        }
        let mut items = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            let mut sorted: Vec<_> = entries.flatten().collect();
            sorted.sort_by_key(|e| {
                let is_dir = e.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let name = e.file_name().to_string_lossy().to_lowercase();
                (!is_dir, name) // dirs first
            });
            for entry in sorted {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }
                let entry_path = entry.path();
                let resolved = std::fs::canonicalize(&entry_path).unwrap_or(entry_path.clone());
                let is_dir = resolved.is_dir();
                let size = if !is_dir { std::fs::metadata(&resolved).map(|m| m.len()).unwrap_or(0) } else { 0 };

                let mut item = serde_json::json!({
                    "name": name,
                    "path": resolved.to_string_lossy(),
                    "isDir": is_dir,
                    "size": size,
                });

                if is_dir {
                    item["children"] = scan(&resolved, depth + 1);
                }
                items.push(item);
            }
        }
        serde_json::Value::Array(items)
    }

    let dir = std::path::PathBuf::from(&path);
    let resolved = std::fs::canonicalize(&dir).unwrap_or(dir);
    Ok(scan(&resolved, 0))
}

/// Read a file's content as string (for skill/config file viewing)
#[tauri::command]
pub fn read_text_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.exists() {
        return Err("File not found".to_string());
    }
    let size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
    let limit = max_bytes.unwrap_or(500_000); // 500KB default
    if size > limit {
        return Err(format!("File too large: {} bytes (limit {})", size, limit));
    }
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read: {}", e))
}

/// Uninstall a skill by removing its directory (or symlink) from the skills folder
#[tauri::command]
pub fn uninstall_skill(path: String) -> Result<(), String> {
    let skill_path = std::path::PathBuf::from(&path);

    // Safety: only allow removing from known skills directories
    let path_str = skill_path.to_string_lossy();
    if !path_str.contains("/skills/") && !path_str.contains("/.claude/") {
        return Err("Not a valid skill path".to_string());
    }

    if skill_path.is_symlink() {
        // Remove the symlink only, don't touch the target
        std::fs::remove_file(&skill_path)
            .map_err(|e| format!("Failed to remove symlink: {}", e))?;
    } else if skill_path.is_dir() {
        std::fs::remove_dir_all(&skill_path)
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        return Err("Path does not exist".to_string());
    }

    Ok(())
}

/// Read marketplace.json and list all available plugins with install status
#[tauri::command]
pub fn list_marketplace_plugins(home_dir: String) -> Result<serde_json::Value, String> {
    let base = std::path::PathBuf::from(&home_dir).join("plugins/marketplaces");
    if !base.exists() {
        return Ok(serde_json::json!({ "marketplaces": [] }));
    }

    let mut marketplaces = Vec::new();

    for entry in std::fs::read_dir(&base).map_err(|e| e.to_string())?.flatten() {
        let mp_dir = entry.path();
        if !mp_dir.is_dir() { continue; }
        let mp_name = entry.file_name().to_string_lossy().to_string();
        if mp_name.starts_with('.') { continue; }

        let manifest_path = mp_dir.join(".claude-plugin/marketplace.json");
        if !manifest_path.exists() { continue; }

        let content = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        let manifest: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

        // Check which plugins are installed (have local directory)
        let plugins_dir = mp_dir.join("plugins");
        let external_dir = mp_dir.join("external_plugins");

        let mut plugins_with_status = Vec::new();
        if let Some(plugins) = manifest.get("plugins").and_then(|v| v.as_array()) {
            for plugin in plugins {
                let name = plugin.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let installed = plugins_dir.join(name).exists() || external_dir.join(name).exists();
                let mut p = plugin.clone();
                if let Some(obj) = p.as_object_mut() {
                    obj.insert("installed".to_string(), serde_json::Value::Bool(installed));
                }
                plugins_with_status.push(p);
            }
        }

        marketplaces.push(serde_json::json!({
            "name": mp_name,
            "description": manifest.get("description").and_then(|v| v.as_str()).unwrap_or(""),
            "plugins": plugins_with_status,
            "totalPlugins": plugins_with_status.len(),
        }));
    }

    Ok(serde_json::json!({ "marketplaces": marketplaces }))
}

/// Read a JSON file and return parsed content
#[tauri::command]
pub fn read_json_file(path: String) -> Result<serde_json::Value, String> {
    let file_path = std::path::PathBuf::from(&path);
    if !file_path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;
    // Try JSON first, then JSON5
    serde_json::from_str(&content)
        .or_else(|_| json5::from_str(&content).map_err(|e| format!("Parse error: {}", e)))
}

fn launch_claude_terminal() -> Result<CliResult, String> {
    let output = Command::new("open")
        .args(["-a", "Terminal", "--args", "claude"])
        .output()
        .or_else(|_| {
            Command::new("osascript")
                .args(["-e", "tell application \"Terminal\" to do script \"claude\""])
                .output()
        })
        .map_err(|e| format!("Failed to launch Claude runtime: {}", e))?;

    Ok(CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        success: output.status.success(),
        json: None,
    })
}

fn resolve_custom_agent_runtime(agent_id: &str) -> Option<String> {
    let hub = super::config::read_hub_config().ok()?;
    let custom_agents = hub.get("customAgents")?;
    let configs = serde_json::from_value::<Vec<CustomAgentConfig>>(custom_agents.clone()).ok()?;

    configs
        .into_iter()
        .find(|config| config.id == agent_id)
        .map(|config| config.runtime_profile.runtime_family)
}

/// Launch an agent process (openclaw gateway, claude code, etc.)
#[tauri::command]
pub async fn launch_agent(agent_type: String, config_path: Option<String>) -> Result<CliResult, String> {
    let resolved_agent_type = resolve_custom_agent_runtime(&agent_type).unwrap_or(agent_type.clone());

    match resolved_agent_type.as_str() {
        "openclaw" | "qclaw" => {
            // Start openclaw gateway
            let args = vec!["gateway".to_string()];
            run_openclaw_cmd(args, config_path).await
        }
        "claude-code" => launch_claude_terminal(),
        "workbuddy" => {
            let output = Command::new("open")
                .args(["-a", "WorkBuddy"])
                .output()
                .map_err(|e| format!("Failed to launch WorkBuddy: {}", e))?;
            Ok(CliResult {
                stdout: String::new(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                success: output.status.success(),
                json: None,
            })
        }
        "autoclaw" => {
            let output = Command::new("open")
                .args(["-a", "QClaw"])
                .output()
                .or_else(|_| Command::new("open").args(["-a", "AutoClaw"]).output())
                .map_err(|e| format!("Failed to launch: {}", e))?;
            Ok(CliResult {
                stdout: String::new(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                success: output.status.success(),
                json: None,
            })
        }
        _ => Err(format!("Unknown agent type: {}", agent_type)),
    }
}

/// Kill an agent process by PID
#[tauri::command]
pub fn kill_agent(pid: u32) -> Result<(), String> {
    let output = Command::new("kill")
        .arg(pid.to_string())
        .output()
        .map_err(|e| format!("Failed to kill process: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!("kill failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Shortcut: openclaw config get <path> --json
#[tauri::command]
pub async fn openclaw_config_get(
    path: String,
    config_path: Option<String>,
) -> Result<CliResult, String> {
    run_openclaw_cmd(vec!["config".into(), "get".into(), path, "--json".into()], config_path).await
}

/// Write a JSON string to any config file (for agents that don't use our module system)
#[tauri::command]
pub fn write_json_file(path: String, data: String) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(&path);

    // Safety: only allow writing to known config locations
    let path_str = file_path.to_string_lossy();
    let allowed = path_str.contains(".claude/")
        || path_str.contains(".codex/")
        || path_str.contains(".workbuddy/")
        || path_str.contains(".config/opencode/")
        || path_str.contains(".openclaw/")
        || path_str.contains(".qclaw/")
        || path_str.contains("AutoClaw/")
        || path_str.contains(".agenthub/");

    if !allowed {
        return Err(format!("Writing to {} is not allowed", path));
    }

    // Validate JSON
    serde_json::from_str::<serde_json::Value>(&data)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Backup existing file
    if file_path.exists() {
        let backup = file_path.with_extension("json.bak");
        let _ = std::fs::copy(&file_path, &backup);
    }

    // Atomic write
    if let Some(dir) = file_path.parent() {
        let tmp = tempfile::NamedTempFile::new_in(dir)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;
        std::fs::write(tmp.path(), &data)
            .map_err(|e| format!("Failed to write: {}", e))?;
        tmp.persist(&file_path)
            .map_err(|e| format!("Failed to persist: {}", e))?;
    } else {
        std::fs::write(&file_path, &data)
            .map_err(|e| format!("Failed to write: {}", e))?;
    }

    Ok(())
}

/// Shortcut: openclaw config set <path> <value>
#[tauri::command]
pub async fn openclaw_config_set(
    path: String,
    value: String,
    config_path: Option<String>,
) -> Result<CliResult, String> {
    run_openclaw_cmd(vec!["config".into(), "set".into(), path, value], config_path).await
}
