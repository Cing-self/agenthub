mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::config::read_config,
            commands::config::read_config_module,
            commands::config::write_config_module,
            commands::config::get_config_path,
            commands::config::read_hub_config,
            commands::config::write_hub_config_module,
            commands::health::check_health,
            commands::health::detect_agents,
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::skills::list_clawhub_skills,
            commands::skills::search_clawhub_skills,
            commands::skills::get_popular_skills,
            commands::skills::get_skill_detail,
            commands::skills::get_skill_detail_convex,
            commands::skills::get_skill_readme,
            commands::monitor::get_token_usage,
            commands::monitor::get_api_usage,
            commands::monitor::fetch_provider_models,
            commands::memory::scan_agent_memories,
            commands::cli::run_openclaw_cmd,
            commands::cli::run_shell_cmd,
            commands::cli::github_oauth_login,
            commands::cli::openclaw_config_get,
            commands::cli::openclaw_config_set,
            commands::cli::write_json_file,
            commands::cli::read_json_file,
            commands::cli::launch_agent,
            commands::cli::kill_agent,
            commands::cli::scan_directory_items,
            commands::cli::uninstall_skill,
            commands::cli::list_marketplace_plugins,
            commands::cli::scan_directory_tree,
            commands::cli::read_text_file,
            commands::collaboration::list_connectors,
            commands::collaboration::upsert_connector,
            commands::collaboration::delete_connector,
            commands::collaboration::list_threads,
            commands::collaboration::create_thread,
            commands::collaboration::rename_thread,
            commands::collaboration::get_thread_bundle,
            commands::collaboration::upsert_board,
            commands::collaboration::create_board_task,
            commands::collaboration::list_thread_sessions,
            commands::collaboration::ensure_thread_session,
            commands::collaboration::create_handoff_packet,
            commands::collaboration::record_thread_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
