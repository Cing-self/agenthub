use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};

const LOCAL_CONNECTOR_ID: &str = "local.default";
static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConnectorCapabilities {
    pub list_agents: bool,
    pub get_health: bool,
    pub read_config: bool,
    pub write_config: bool,
    pub launch_agent: bool,
    pub stop_agent: bool,
    pub stream_logs: bool,
    pub create_or_resume_session: bool,
    pub submit_handoff: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConnectorRef {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub status: String,
    pub location_label: String,
    pub auth_mode: String,
    #[serde(default)]
    pub base_url: Option<String>,
    pub capabilities: ConnectorCapabilities,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuntimeCapabilities {
    pub native_session: bool,
    pub resume_session: bool,
    pub handoff_packet: bool,
    pub structured_tasks: bool,
    pub streaming_output: bool,
    pub tool_calls: bool,
    pub federated_inbox: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThreadRef {
    pub id: String,
    pub title: String,
    pub goal: String,
    pub status: String,
    #[serde(default, alias = "default_agent_id")]
    pub primary_agent_id: Option<String>,
    pub board_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentSessionRef {
    pub id: String,
    pub thread_id: String,
    pub agent_id: String,
    #[serde(default)]
    pub runtime_session_id: Option<String>,
    pub mode: String,
    pub status: String,
    pub last_seen_board_version: u64,
    pub last_handoff_version: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BoardArtifact {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub r#ref: String,
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskBoard {
    pub id: String,
    pub thread_id: String,
    pub version: u64,
    pub objective: String,
    #[serde(default)]
    pub current_focus: Option<String>,
    pub summary: String,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub open_questions: Vec<String>,
    #[serde(default)]
    pub key_files: Vec<String>,
    #[serde(default)]
    pub artifacts: Vec<BoardArtifact>,
    #[serde(default)]
    pub updated_by: Option<String>,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BoardTask {
    pub id: String,
    pub thread_id: String,
    pub board_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    #[serde(default)]
    pub assigned_agent_id: Option<String>,
    pub priority: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub artifact_refs: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskEvent {
    pub id: String,
    pub thread_id: String,
    pub board_version: u64,
    pub event_type: String,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub payload: Option<Value>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HandoffPacket {
    pub thread_id: String,
    pub board_id: String,
    pub board_version: u64,
    #[serde(default)]
    pub from_agent_id: Option<String>,
    pub to_agent_id: String,
    pub objective: String,
    #[serde(default)]
    pub current_focus: Option<String>,
    pub summary: String,
    #[serde(default)]
    pub open_questions: Vec<String>,
    #[serde(default)]
    pub key_files: Vec<String>,
    #[serde(default)]
    pub artifact_refs: Vec<String>,
    #[serde(default)]
    pub selected_task_ids: Vec<String>,
    #[serde(default)]
    pub recent_context: Vec<String>,
    pub latest_user_message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CollaborationRoute {
    pub id: String,
    pub source_agent_id: String,
    pub target_agent_id: String,
    pub mode: String,
    #[serde(default)]
    pub protocol: Option<String>,
    pub trigger: String,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CollaborationState {
    #[serde(default)]
    pub connectors: Vec<ConnectorRef>,
    #[serde(default)]
    pub threads: Vec<ThreadRef>,
    #[serde(default)]
    pub boards: Vec<TaskBoard>,
    #[serde(default)]
    pub tasks: Vec<BoardTask>,
    #[serde(default)]
    pub sessions: Vec<AgentSessionRef>,
    #[serde(default)]
    pub events: Vec<TaskEvent>,
    #[serde(default)]
    pub routes: Vec<CollaborationRoute>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThreadBundle {
    pub thread: ThreadRef,
    pub board: TaskBoard,
    pub tasks: Vec<BoardTask>,
    pub sessions: Vec<AgentSessionRef>,
    pub events: Vec<TaskEvent>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn next_id(prefix: &str) -> String {
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}_{}_{}", prefix, Utc::now().timestamp_millis(), seq)
}

fn compact_event_text(input: &str, max_len: usize) -> String {
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_len {
        return normalized;
    }

    normalized.chars().take(max_len).collect::<String>() + "..."
}

fn read_collaboration_state() -> Result<CollaborationState, String> {
    let hub = super::config::read_hub_config()?;
    let state = match hub.get("collaboration") {
        Some(raw) => serde_json::from_value::<CollaborationState>(raw.clone()).unwrap_or_default(),
        None => CollaborationState::default(),
    };
    Ok(state)
}

fn write_collaboration_state(state: &CollaborationState) -> Result<(), String> {
    let value = serde_json::to_value(state)
        .map_err(|e| format!("Failed to serialize collaboration state: {}", e))?;
    super::config::write_hub_config_module("collaboration".to_string(), value)
}

fn local_connector_capabilities() -> ConnectorCapabilities {
    ConnectorCapabilities {
        list_agents: true,
        get_health: true,
        read_config: true,
        write_config: true,
        launch_agent: true,
        stop_agent: true,
        stream_logs: true,
        create_or_resume_session: true,
        submit_handoff: true,
    }
}

fn build_local_connector() -> ConnectorRef {
    match super::health::detect_agents() {
        Ok(health) => ConnectorRef {
            id: LOCAL_CONNECTOR_ID.to_string(),
            name: "This Mac".to_string(),
            r#type: "local".to_string(),
            status: "online".to_string(),
            location_label: "Current machine".to_string(),
            auth_mode: "none".to_string(),
            base_url: None,
            capabilities: local_connector_capabilities(),
            metadata: Some(json!({
                "total_detected": health.total_detected,
                "total_running": health.total_running,
                "agent_ids": health.agents.iter().map(|agent| agent.id.clone()).collect::<Vec<_>>(),
            })),
        },
        Err(err) => ConnectorRef {
            id: LOCAL_CONNECTOR_ID.to_string(),
            name: "This Mac".to_string(),
            r#type: "local".to_string(),
            status: "degraded".to_string(),
            location_label: "Current machine".to_string(),
            auth_mode: "none".to_string(),
            base_url: None,
            capabilities: local_connector_capabilities(),
            metadata: Some(json!({ "error": err })),
        },
    }
}

fn get_thread_bundle_from_state(
    state: &CollaborationState,
    thread_id: &str,
) -> Result<ThreadBundle, String> {
    let thread = state
        .threads
        .iter()
        .find(|thread| thread.id == thread_id)
        .cloned()
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let board = state
        .boards
        .iter()
        .find(|board| board.id == thread.board_id)
        .cloned()
        .ok_or_else(|| format!("Board not found for thread: {}", thread_id))?;

    let mut tasks: Vec<BoardTask> = state
        .tasks
        .iter()
        .filter(|task| task.thread_id == thread_id)
        .cloned()
        .collect();
    tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let mut sessions: Vec<AgentSessionRef> = state
        .sessions
        .iter()
        .filter(|session| session.thread_id == thread_id)
        .cloned()
        .collect();
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let mut events: Vec<TaskEvent> = state
        .events
        .iter()
        .filter(|event| event.thread_id == thread_id)
        .cloned()
        .collect();
    events.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(ThreadBundle {
        thread,
        board,
        tasks,
        sessions,
        events,
    })
}

#[tauri::command]
pub fn list_connectors() -> Result<Vec<ConnectorRef>, String> {
    let mut state = read_collaboration_state()?;
    state.connectors.retain(|connector| connector.id != LOCAL_CONNECTOR_ID);

    let mut connectors = vec![build_local_connector()];
    connectors.extend(state.connectors);
    Ok(connectors)
}

#[tauri::command]
pub fn upsert_connector(mut connector: ConnectorRef) -> Result<ConnectorRef, String> {
    if connector.id == LOCAL_CONNECTOR_ID || connector.r#type == "local" {
        return Err("The built-in local connector cannot be modified".to_string());
    }

    if connector.id.trim().is_empty() {
        connector.id = next_id("connector");
    }
    if connector.status.trim().is_empty() {
        connector.status = "offline".to_string();
    }
    if connector.location_label.trim().is_empty() {
        connector.location_label = "Remote environment".to_string();
    }

    let mut state = read_collaboration_state()?;
    match state
        .connectors
        .iter_mut()
        .find(|existing| existing.id == connector.id)
    {
        Some(existing) => *existing = connector.clone(),
        None => state.connectors.push(connector.clone()),
    }

    write_collaboration_state(&state)?;
    Ok(connector)
}

#[tauri::command]
pub fn delete_connector(id: String) -> Result<(), String> {
    if id == LOCAL_CONNECTOR_ID {
        return Err("The built-in local connector cannot be deleted".to_string());
    }

    let mut state = read_collaboration_state()?;
    state.connectors.retain(|connector| connector.id != id);
    write_collaboration_state(&state)
}

#[tauri::command]
pub fn list_threads() -> Result<Vec<ThreadRef>, String> {
    let mut state = read_collaboration_state()?;
    state.threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(state.threads)
}

#[tauri::command]
pub fn create_thread(
    title: String,
    goal: String,
    primary_agent_id: Option<String>,
) -> Result<ThreadBundle, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Thread title cannot be empty".to_string());
    }

    let trimmed_goal = goal.trim();
    let now = now_iso();
    let thread_id = next_id("thread");
    let board_id = next_id("board");

    let thread = ThreadRef {
        id: thread_id.clone(),
        title: trimmed_title.to_string(),
        goal: trimmed_goal.to_string(),
        status: "active".to_string(),
        primary_agent_id,
        board_id: board_id.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let board = TaskBoard {
        id: board_id,
        thread_id: thread_id.clone(),
        version: 1,
        objective: if trimmed_goal.is_empty() {
            trimmed_title.to_string()
        } else {
            trimmed_goal.to_string()
        },
        current_focus: None,
        summary: String::new(),
        decisions: vec![],
        open_questions: vec![],
        key_files: vec![],
        artifacts: vec![],
        updated_by: None,
        updated_at: now.clone(),
    };

    let event = TaskEvent {
        id: next_id("event"),
        thread_id: thread_id.clone(),
        board_version: board.version,
        event_type: "thread_created".to_string(),
        title: "任务线已创建".to_string(),
        body: Some("这条任务线已经准备好，可以开始协作。".to_string()),
        agent_id: None,
        session_id: None,
        task_id: None,
        payload: None,
        created_at: now,
    };

    let mut state = read_collaboration_state()?;
    state.threads.push(thread.clone());
    state.boards.push(board.clone());
    state.events.push(event.clone());
    write_collaboration_state(&state)?;

    Ok(ThreadBundle {
        thread,
        board,
        tasks: vec![],
        sessions: vec![],
        events: vec![event],
    })
}

#[tauri::command]
pub fn rename_thread(thread_id: String, title: String) -> Result<ThreadRef, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Thread title cannot be empty".to_string());
    }

    let mut state = read_collaboration_state()?;
    let now = now_iso();
    let thread_index = state
        .threads
        .iter()
        .position(|thread| thread.id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    state.threads[thread_index].title = trimmed_title.to_string();
    state.threads[thread_index].updated_at = now.clone();
    let thread = state.threads[thread_index].clone();

    let board_version = state
        .boards
        .iter()
        .find(|board| board.id == thread.board_id)
        .map(|board| board.version)
        .unwrap_or(1);

    state.events.push(TaskEvent {
        id: next_id("event"),
        thread_id: thread.id.clone(),
        board_version,
        event_type: "thread_renamed".to_string(),
        title: format!("任务线已重命名为：{}", thread.title),
        body: None,
        agent_id: None,
        session_id: None,
        task_id: None,
        payload: None,
        created_at: now,
    });

    write_collaboration_state(&state)?;
    Ok(thread)
}

#[tauri::command]
pub fn set_thread_primary_agent(thread_id: String, agent_id: String) -> Result<ThreadRef, String> {
    let mut state = read_collaboration_state()?;
    let now = now_iso();

    let board_version = state
        .threads
        .iter()
        .find(|thread| thread.id == thread_id)
        .and_then(|thread| state.boards.iter().find(|board| board.id == thread.board_id))
        .map(|board| board.version)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let thread = state
        .threads
        .iter_mut()
        .find(|thread| thread.id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    thread.primary_agent_id = Some(agent_id.clone());
    thread.updated_at = now.clone();

    state.events.push(TaskEvent {
        id: next_id("event"),
        thread_id: thread_id.clone(),
        board_version,
        event_type: "primary_agent_updated".to_string(),
        title: format!("主 Agent 已切换到 {}", agent_id),
        body: Some("这条任务线的默认接手 Agent 已更新。".to_string()),
        agent_id: Some(agent_id),
        session_id: None,
        task_id: None,
        payload: None,
        created_at: now,
    });

    let snapshot = thread.clone();
    write_collaboration_state(&state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn get_thread_bundle(thread_id: String) -> Result<ThreadBundle, String> {
    let state = read_collaboration_state()?;
    get_thread_bundle_from_state(&state, &thread_id)
}

#[tauri::command]
pub fn upsert_board(mut board: TaskBoard) -> Result<TaskBoard, String> {
    let mut state = read_collaboration_state()?;

    let board_index = state
        .boards
        .iter()
        .position(|existing| existing.id == board.id && existing.thread_id == board.thread_id)
        .ok_or_else(|| format!("Board not found: {}", board.id))?;

    let next_version = state.boards[board_index].version + 1;
    let now = now_iso();
    board.version = next_version;
    board.updated_at = now.clone();
    state.boards[board_index] = board.clone();

    if let Some(thread) = state
        .threads
        .iter_mut()
        .find(|thread| thread.id == board.thread_id)
    {
        thread.updated_at = now.clone();
    }

    state.events.push(TaskEvent {
        id: next_id("event"),
        thread_id: board.thread_id.clone(),
        board_version: board.version,
        event_type: "summary_updated".to_string(),
        title: "共享任务板已更新".to_string(),
        body: Some("目标、摘要或关键上下文字段发生了更新。".to_string()),
        agent_id: board.updated_by.clone(),
        session_id: None,
        task_id: None,
        payload: None,
        created_at: now,
    });

    write_collaboration_state(&state)?;
    Ok(board)
}

#[tauri::command]
pub fn create_board_task(
    thread_id: String,
    title: String,
    description: String,
    assigned_agent_id: Option<String>,
    priority: Option<String>,
) -> Result<BoardTask, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Task title cannot be empty".to_string());
    }

    let mut state = read_collaboration_state()?;
    let thread_index = state
        .threads
        .iter()
        .position(|thread| thread.id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let thread_id = state.threads[thread_index].id.clone();
    let board_id = state.threads[thread_index].board_id.clone();
    let board_version = state
        .boards
        .iter()
        .find(|board| board.id == board_id)
        .map(|board| board.version)
        .unwrap_or(1);

    let now = now_iso();
    let task = BoardTask {
        id: next_id("task"),
        thread_id: thread_id.clone(),
        board_id,
        title: trimmed_title.to_string(),
        description: description.trim().to_string(),
        status: "todo".to_string(),
        assigned_agent_id: assigned_agent_id.clone(),
        priority: priority
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "medium".to_string()),
        depends_on: vec![],
        artifact_refs: vec![],
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    state.threads[thread_index].updated_at = now.clone();
    state.tasks.push(task.clone());
    state.events.push(TaskEvent {
        id: next_id("event"),
        thread_id,
        board_version,
        event_type: "task_created".to_string(),
        title: format!("已新增子任务：{}", task.title),
        body: if task.description.is_empty() {
            None
        } else {
            Some(task.description.clone())
        },
        agent_id: assigned_agent_id,
        session_id: None,
        task_id: Some(task.id.clone()),
        payload: None,
        created_at: now,
    });

    write_collaboration_state(&state)?;
    Ok(task)
}

#[tauri::command]
pub fn list_thread_sessions(thread_id: String) -> Result<Vec<AgentSessionRef>, String> {
    let state = read_collaboration_state()?;
    let mut sessions: Vec<AgentSessionRef> = state
        .sessions
        .into_iter()
        .filter(|session| session.thread_id == thread_id)
        .collect();
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

#[tauri::command]
pub fn ensure_thread_session(
    thread_id: String,
    agent_id: String,
    mode: Option<String>,
    runtime_session_id: Option<String>,
) -> Result<AgentSessionRef, String> {
    let mut state = read_collaboration_state()?;
    let now = now_iso();

    let board_version = state
        .threads
        .iter()
        .find(|thread| thread.id == thread_id)
        .and_then(|thread| state.boards.iter().find(|board| board.id == thread.board_id))
        .map(|board| board.version)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let session = match state
        .sessions
        .iter_mut()
        .find(|session| session.thread_id == thread_id && session.agent_id == agent_id)
    {
        Some(existing) => {
            if let Some(runtime_id) = runtime_session_id {
                existing.runtime_session_id = Some(runtime_id);
            }
            if let Some(next_mode) = mode.clone() {
                existing.mode = next_mode;
            }
            existing.updated_at = now.clone();
            existing.status = "idle".to_string();
            existing.clone()
        }
        None => {
            let session = AgentSessionRef {
                id: next_id("session"),
                thread_id: thread_id.clone(),
                agent_id: agent_id.clone(),
                runtime_session_id,
                mode: mode.unwrap_or_else(|| "stateless".to_string()),
                status: "idle".to_string(),
                last_seen_board_version: board_version,
                last_handoff_version: 0,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            state.sessions.push(session.clone());
            state.events.push(TaskEvent {
                id: next_id("event"),
                thread_id: thread_id.clone(),
                board_version,
                event_type: "session_created".to_string(),
                title: format!("已建立会话：{}", agent_id),
                body: Some("当前线程下的 Agent 会话映射已创建。".to_string()),
                agent_id: Some(agent_id.clone()),
                session_id: Some(session.id.clone()),
                task_id: None,
                payload: None,
                created_at: now.clone(),
            });
            session
        }
    };

    write_collaboration_state(&state)?;
    Ok(session)
}

#[tauri::command]
pub fn update_thread_session(
    thread_id: String,
    agent_id: String,
    runtime_session_id: Option<String>,
    mode: Option<String>,
    status: Option<String>,
    last_seen_board_version: Option<u64>,
    last_handoff_version: Option<u64>,
) -> Result<AgentSessionRef, String> {
    let mut state = read_collaboration_state()?;
    let now = now_iso();

    let thread = state
        .threads
        .iter_mut()
        .find(|thread| thread.id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;
    thread.updated_at = now.clone();

    let session = state
        .sessions
        .iter_mut()
        .find(|session| session.thread_id == thread_id && session.agent_id == agent_id)
        .ok_or_else(|| format!("Session not found for thread {} and agent {}", thread_id, agent_id))?;

    if let Some(runtime_id) = runtime_session_id {
        session.runtime_session_id = Some(runtime_id);
    }
    if let Some(next_mode) = mode {
        session.mode = next_mode;
    }
    if let Some(next_status) = status {
        session.status = next_status;
    }
    if let Some(version) = last_seen_board_version {
        session.last_seen_board_version = session.last_seen_board_version.max(version);
    }
    if let Some(version) = last_handoff_version {
        session.last_handoff_version = session.last_handoff_version.max(version);
    }
    session.updated_at = now;

    let snapshot = session.clone();
    write_collaboration_state(&state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn create_handoff_packet(
    thread_id: String,
    to_agent_id: String,
    latest_user_message: String,
    from_agent_id: Option<String>,
) -> Result<HandoffPacket, String> {
    let state = read_collaboration_state()?;
    let bundle = get_thread_bundle_from_state(&state, &thread_id)?;
    let latest_user_message_trimmed = latest_user_message.trim().to_string();

    let selected_task_ids = bundle
        .tasks
        .iter()
        .filter(|task| {
            task.status != "done"
                && task.status != "cancelled"
                && (task.assigned_agent_id.as_deref() == Some(to_agent_id.as_str())
                    || task.assigned_agent_id.is_none())
        })
        .take(5)
        .map(|task| task.id.clone())
        .collect::<Vec<_>>();

    let artifact_refs = bundle
        .board
        .artifacts
        .iter()
        .map(|artifact| artifact.r#ref.clone())
        .collect::<Vec<_>>();

    let mut skipped_latest_user = false;
    let recent_context = bundle
        .events
        .iter()
        .filter(|event| event.event_type == "user_message" || event.event_type == "assistant_message")
        .filter(|event| {
            if skipped_latest_user
                || event.event_type != "user_message"
                || latest_user_message_trimmed.is_empty()
            {
                return true;
            }

            let is_latest = event
                .body
                .as_deref()
                .map(|body| body.trim() == latest_user_message_trimmed)
                .unwrap_or(false);
            if is_latest {
                skipped_latest_user = true;
                return false;
            }

            true
        })
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .filter_map(|event| {
            let body = event.body.as_deref()?.trim();
            if body.is_empty() {
                return None;
            }

            let label = if event.event_type == "user_message" {
                "用户".to_string()
            } else {
                event.agent_id.clone().unwrap_or_else(|| "Agent".to_string())
            };

            Some(format!("{}：{}", label, compact_event_text(body, 220)))
        })
        .collect::<Vec<_>>();

    Ok(HandoffPacket {
        thread_id: bundle.thread.id,
        board_id: bundle.board.id,
        board_version: bundle.board.version,
        from_agent_id,
        to_agent_id,
        objective: bundle.board.objective,
        current_focus: bundle.board.current_focus,
        summary: bundle.board.summary,
        open_questions: bundle.board.open_questions,
        key_files: bundle.board.key_files,
        artifact_refs,
        selected_task_ids,
        recent_context,
        latest_user_message,
    })
}

#[tauri::command]
pub fn record_thread_event(
    thread_id: String,
    event_type: String,
    title: String,
    body: Option<String>,
    agent_id: Option<String>,
    session_id: Option<String>,
    task_id: Option<String>,
    payload: Option<Value>,
) -> Result<TaskEvent, String> {
    let mut state = read_collaboration_state()?;
    let now = now_iso();

    let board_version = state
        .threads
        .iter()
        .find(|thread| thread.id == thread_id)
        .and_then(|thread| state.boards.iter().find(|board| board.id == thread.board_id))
        .map(|board| board.version)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    if let Some(thread) = state.threads.iter_mut().find(|thread| thread.id == thread_id) {
        thread.updated_at = now.clone();
    }

    let event = TaskEvent {
        id: next_id("event"),
        thread_id,
        board_version,
        event_type,
        title,
        body,
        agent_id,
        session_id,
        task_id,
        payload,
        created_at: now,
    };

    state.events.push(event.clone());
    write_collaboration_state(&state)?;
    Ok(event)
}
