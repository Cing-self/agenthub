use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RuntimeProfile {
    pub runtime_family: String,
    pub auth_source: Option<String>,
    pub default_model: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CustomAgentConfig {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub runtime_profile: RuntimeProfile,
    pub model_ids: Option<Vec<String>>,
    pub mcp_server_ids: Option<Vec<String>>,
    pub skill_directories: Option<Vec<String>>,
}

pub fn default_custom_agents() -> Vec<CustomAgentConfig> {
    vec![CustomAgentConfig {
        id: "dolphin".to_string(),
        name: "dolphin".to_string(),
        icon: Some("🐬".to_string()),
        runtime_profile: RuntimeProfile {
            runtime_family: "claude-code".to_string(),
            auth_source: Some("claude-subscription".to_string()),
            default_model: None,
        },
        model_ids: Some(vec![]),
        mcp_server_ids: Some(vec![]),
        skill_directories: Some(vec![]),
    }]
}

pub fn read_custom_agents() -> Vec<CustomAgentConfig> {
    let hub = match super::config::read_hub_config() {
        Ok(value) => value,
        Err(_) => return default_custom_agents(),
    };

    let custom_agents = hub
        .get("customAgents")
        .and_then(|value| serde_json::from_value::<Vec<CustomAgentConfig>>(value.clone()).ok())
        .unwrap_or_default();

    if custom_agents.is_empty() {
        default_custom_agents()
    } else {
        custom_agents
    }
}

fn write_custom_agents(custom_agents: &[CustomAgentConfig]) -> Result<(), String> {
    super::config::write_hub_config_module(
        "customAgents".to_string(),
        serde_json::to_value(custom_agents)
            .map_err(|error| format!("Failed to serialize custom agents: {}", error))?,
    )
}

fn existing_skill_directories_from_disk() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(path) => path,
        None => return vec![],
    };

    let candidates = [
        home.join(".claude").join("skills"),
        home.join(".codex").join("skills"),
        home.join(".opencode").join("skills"),
        home.join(".openclaw").join("skills"),
    ];

    candidates
        .iter()
        .filter(|path| path.exists() && path.is_dir())
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn merged_skill_directories(hub: &Value) -> Vec<String> {
    let mut directories = hub
        .get("skills")
        .and_then(|value| value.get("directories"))
        .and_then(|value| serde_json::from_value::<Vec<String>>(value.clone()).ok())
        .unwrap_or_default();

    for path in existing_skill_directories_from_disk() {
        if !directories.iter().any(|item| item == &path) {
            directories.push(path);
        }
    }

    directories
}

#[tauri::command]
pub fn list_custom_agents() -> Result<Vec<CustomAgentConfig>, String> {
    Ok(read_custom_agents())
}

#[tauri::command]
pub fn get_custom_agent(id: String) -> Result<CustomAgentConfig, String> {
    read_custom_agents()
        .into_iter()
        .find(|agent| agent.id == id)
        .ok_or_else(|| format!("Custom agent not found: {}", id))
}

#[tauri::command]
pub fn upsert_custom_agent(agent: CustomAgentConfig) -> Result<CustomAgentConfig, String> {
    if agent.id.trim().is_empty() {
        return Err("Custom agent id cannot be empty".to_string());
    }
    if agent.name.trim().is_empty() {
        return Err("Custom agent name cannot be empty".to_string());
    }
    if agent.runtime_profile.runtime_family.trim().is_empty() {
        return Err("Runtime family cannot be empty".to_string());
    }

    let mut custom_agents = read_custom_agents();
    if let Some(index) = custom_agents.iter().position(|existing| existing.id == agent.id) {
        custom_agents[index] = agent.clone();
    } else {
        custom_agents.push(agent.clone());
    }

    write_custom_agents(&custom_agents)?;
    Ok(agent)
}

#[tauri::command]
pub fn sync_custom_agent_resources(
    id: String,
    include_models: bool,
    include_mcp_servers: bool,
    include_skills: bool,
) -> Result<CustomAgentConfig, String> {
    let hub = super::config::read_hub_config()?;
    let mut custom_agents = read_custom_agents();
    let index = custom_agents
        .iter()
        .position(|agent| agent.id == id)
        .ok_or_else(|| format!("Custom agent not found: {}", id))?;

    if include_models {
        let model_ids = hub
            .get("models")
            .and_then(|value| serde_json::from_value::<Vec<Value>>(value.clone()).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|item| item.get("enabled").and_then(|value| value.as_bool()).unwrap_or(false))
            .filter_map(|item| item.get("id").and_then(|value| value.as_str()).map(String::from))
            .collect::<Vec<_>>();
        custom_agents[index].model_ids = Some(model_ids.clone());
        if custom_agents[index].runtime_profile.default_model.is_none() {
            custom_agents[index].runtime_profile.default_model = model_ids.first().cloned();
        }
    }

    if include_mcp_servers {
        let mcp_ids = hub
            .get("mcpServers")
            .and_then(|value| serde_json::from_value::<Vec<Value>>(value.clone()).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|item| item.get("enabled").and_then(|value| value.as_bool()).unwrap_or(false))
            .filter_map(|item| item.get("id").and_then(|value| value.as_str()).map(String::from))
            .collect::<Vec<_>>();
        custom_agents[index].mcp_server_ids = Some(mcp_ids);
    }

    if include_skills {
        custom_agents[index].skill_directories = Some(merged_skill_directories(&hub));
    }

    let updated = custom_agents[index].clone();
    write_custom_agents(&custom_agents)?;
    Ok(updated)
}
