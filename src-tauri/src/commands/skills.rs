use serde::{Deserialize, Serialize};

const CLAWHUB_API: &str = "https://clawhub.ai/api/v1";
const CONVEX_API: &str = "https://wry-manatee-359.convex.cloud/api/query";

// ── Convex API types (for listing with sort + pagination) ──

#[derive(Deserialize, Debug)]
struct ConvexResponse {
    value: Option<ConvexValue>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexValue {
    page: Vec<ConvexSkillItem>,
    has_more: bool,
    next_cursor: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexSkillItem {
    skill: ConvexSkill,
    owner: Option<ConvexOwner>,
    owner_handle: Option<String>,
    latest_version: Option<ConvexVersion>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexSkill {
    slug: Option<String>,
    display_name: Option<String>,
    summary: Option<String>,
    stats: Option<ConvexStats>,
    created_at: Option<f64>,
    updated_at: Option<f64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexStats {
    downloads: Option<f64>,
    installs_all_time: Option<f64>,
    installs_current: Option<f64>,
    stars: Option<f64>,
    comments: Option<f64>,
    versions: Option<f64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexOwner {
    handle: Option<String>,
    display_name: Option<String>,
    image: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ConvexVersion {
    version: Option<String>,
    changelog: Option<String>,
    created_at: Option<f64>,
}

// ── Old search API types (for text search only) ──

#[derive(Deserialize, Debug)]
struct SearchResponse {
    results: Vec<SearchResult_>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SearchResult_ {
    slug: Option<String>,
    display_name: Option<String>,
    summary: Option<String>,
    score: Option<f64>,
    updated_at: Option<u64>,
}

// ── Detail API types ──

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DetailResponse {
    skill: Option<DetailSkill>,
    owner: Option<ConvexOwner>,
    latest_version: Option<DetailVersion>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DetailSkill {
    slug: Option<String>,
    display_name: Option<String>,
    summary: Option<String>,
    stats: Option<ConvexStats>,
    created_at: Option<u64>,
    updated_at: Option<u64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DetailVersion {
    version: Option<String>,
    changelog: Option<String>,
    license: Option<String>,
    created_at: Option<u64>,
}

// ── Frontend types ──

#[derive(Serialize, Clone, Debug)]
pub struct SkillInfo {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub author_image: Option<String>,
    pub downloads: u64,
    pub installs: u64,
    pub stars: u64,
    pub version: String,
    pub url: String,
    pub updated_at: Option<u64>,
    pub score: Option<f64>,
    pub changelog: Option<String>,
    pub license: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ListResult {
    pub skills: Vec<SkillInfo>,
    pub total: usize,
    pub has_more: bool,
    pub next_cursor: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
pub struct SearchResult {
    pub skills: Vec<SkillInfo>,
    pub total: usize,
}

// ── Commands ──

/// List skills from Convex API with sorting and pagination
#[tauri::command]
pub async fn list_clawhub_skills(
    sort: Option<String>,
    dir: Option<String>,
    num_items: Option<u32>,
    cursor: Option<serde_json::Value>,
) -> Result<ListResult, String> {
    let client = reqwest::Client::new();
    let sort_key = sort.unwrap_or_else(|| "downloads".to_string());
    let direction = dir.unwrap_or_else(|| "desc".to_string());
    let limit = num_items.unwrap_or(25);

    let mut args = serde_json::json!({
        "dir": direction,
        "highlightedOnly": false,
        "nonSuspiciousOnly": true,
        "numItems": limit,
        "sort": sort_key,
    });

    if let Some(c) = &cursor {
        args["cursor"] = c.clone();
    }

    let body = serde_json::json!({
        "path": "skills:listPublicPageV4",
        "format": "convex_encoded_json",
        "args": [args],
    });

    let response = client.post(CONVEX_API)
        .header("Content-Type", "application/json")
        .header("Convex-Client", "npm-1.34.0")
        .header("Origin", "https://clawhub.ai")
        .json(&body)
        .send().await
        .map_err(|e| format!("Failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let data: ConvexResponse = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
    let value = data.value.ok_or("Empty response")?;

    let skills: Vec<SkillInfo> = value.page.into_iter().map(|item| {
        let slug = item.skill.slug.unwrap_or_default();
        let stats = item.skill.stats.unwrap_or(ConvexStats {
            downloads: None, installs_all_time: None, installs_current: None,
            stars: None, comments: None, versions: None,
        });
        SkillInfo {
            name: item.skill.display_name.unwrap_or_else(|| slug.clone()),
            description: item.skill.summary.unwrap_or_default(),
            author: item.owner_handle.unwrap_or_else(|| {
                item.owner.as_ref().and_then(|o| o.handle.clone().or(o.display_name.clone())).unwrap_or_default()
            }),
            author_image: item.owner.as_ref().and_then(|o| o.image.clone()),
            downloads: stats.downloads.unwrap_or(0.0) as u64,
            installs: stats.installs_all_time.unwrap_or(0.0) as u64,
            stars: stats.stars.unwrap_or(0.0) as u64,
            version: item.latest_version.as_ref().and_then(|v| v.version.clone()).unwrap_or_default(),
            url: format!("https://clawhub.ai/skills/{}", &slug),
            updated_at: item.skill.updated_at.map(|t| t as u64),
            score: None,
            changelog: item.latest_version.as_ref().and_then(|v| v.changelog.clone()),
            license: None,
            slug,
        }
    }).collect();

    let total = skills.len();
    Ok(ListResult {
        skills, total,
        has_more: value.has_more,
        next_cursor: value.next_cursor,
    })
}

/// Search skills (text search via old API)
#[tauri::command]
pub async fn search_clawhub_skills(
    query: String,
    limit: Option<u32>,
) -> Result<SearchResult, String> {
    let client = reqwest::Client::new();
    let q = if query.trim().is_empty() { "a".to_string() } else { query };
    let url = format!("{}/search?q={}&limit={}", CLAWHUB_API, urlencoding::encode(&q), limit.unwrap_or(50));

    let response = client.get(&url).header("User-Agent", "AgentHub/0.1.0")
        .send().await.map_err(|e| format!("Failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let data: SearchResponse = response.json().await.map_err(|e| format!("Parse: {}", e))?;

    let skills: Vec<SkillInfo> = data.results.into_iter().map(|r| {
        let slug = r.slug.unwrap_or_default();
        SkillInfo {
            name: r.display_name.unwrap_or_else(|| slug.clone()),
            description: r.summary.unwrap_or_default(),
            author: String::new(), author_image: None,
            downloads: 0, installs: 0, stars: 0,
            version: String::new(),
            url: format!("https://clawhub.ai/skills/{}", &slug),
            updated_at: r.updated_at, score: r.score,
            changelog: None, license: None, slug,
        }
    }).collect();

    let total = skills.len();
    Ok(SearchResult { skills, total })
}

/// Get skill detail
#[tauri::command]
pub async fn get_skill_detail(slug: String) -> Result<SkillInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/skills/{}", CLAWHUB_API, urlencoding::encode(&slug));

    let response = client.get(&url).header("User-Agent", "AgentHub/0.1.0")
        .send().await.map_err(|e| format!("Failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let data: DetailResponse = response.json().await.map_err(|e| format!("Parse: {}", e))?;
    let skill = data.skill.ok_or("Not found")?;
    let slug = skill.slug.unwrap_or_default();
    let stats = skill.stats.unwrap_or(ConvexStats {
        downloads: None, installs_all_time: None, installs_current: None,
        stars: None, comments: None, versions: None,
    });

    let author = data.owner.as_ref().and_then(|o| o.handle.clone().or(o.display_name.clone())).unwrap_or_default();
    let author_image = data.owner.as_ref().and_then(|o| o.image.clone());

    Ok(SkillInfo {
        name: skill.display_name.unwrap_or_else(|| slug.clone()),
        description: skill.summary.unwrap_or_default(),
        author, author_image,
        downloads: stats.downloads.unwrap_or(0.0) as u64,
        installs: stats.installs_all_time.unwrap_or(0.0) as u64,
        stars: stats.stars.unwrap_or(0.0) as u64,
        version: data.latest_version.as_ref().and_then(|v| v.version.clone()).unwrap_or_default(),
        url: format!("https://clawhub.ai/skills/{}", &slug),
        updated_at: skill.updated_at,
        score: None,
        changelog: data.latest_version.as_ref().and_then(|v| v.changelog.clone()),
        license: data.latest_version.as_ref().and_then(|v| v.license.clone()),
        slug,
    })
}

/// Get popular skills (shortcut)
#[tauri::command]
pub async fn get_popular_skills(limit: Option<u32>) -> Result<SearchResult, String> {
    let result = list_clawhub_skills(Some("downloads".into()), Some("desc".into()), limit.or(Some(25)), None).await?;
    Ok(SearchResult { skills: result.skills, total: result.total })
}

/// Get full skill detail from Convex API (richer than REST)
#[tauri::command]
pub async fn get_skill_detail_convex(slug: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "path": "skills:getBySlug",
        "format": "convex_encoded_json",
        "args": [{ "slug": slug }],
    });

    let response = client.post(CONVEX_API)
        .header("Content-Type", "application/json")
        .header("Convex-Client", "npm-1.34.0")
        .header("Origin", "https://clawhub.ai")
        .json(&body)
        .send().await
        .map_err(|e| format!("Failed: {}", e))?;

    let data: serde_json::Value = response.json().await.map_err(|e| format!("Parse: {}", e))?;
    Ok(data.get("value").cloned().unwrap_or(serde_json::Value::Null))
}

/// Get SKILL.md content from Convex API
#[tauri::command]
pub async fn get_skill_readme(version_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "path": "skills:getReadme",
        "format": "convex_encoded_json",
        "args": [{ "versionId": version_id }],
    });

    // Note: getReadme uses /api/action, not /api/query
    let action_url = CONVEX_API.replace("/api/query", "/api/action");
    let response = client.post(&action_url)
        .header("Content-Type", "application/json")
        .header("Convex-Client", "npm-1.34.0")
        .header("Origin", "https://clawhub.ai")
        .json(&body)
        .send().await
        .map_err(|e| format!("Failed: {}", e))?;

    let data: serde_json::Value = response.json().await.map_err(|e| format!("Parse: {}", e))?;
    Ok(data.get("value").cloned().unwrap_or(serde_json::Value::Null))
}
