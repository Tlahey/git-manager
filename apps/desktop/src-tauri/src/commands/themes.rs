use crate::models::UserTheme;
use std::fs;
use std::path::PathBuf;

fn user_themes_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(|| {
        #[allow(deprecated)]
        std::env::home_dir()
    })?;
    Some(home.join(".git-manager").join("themes"))
}

#[tauri::command]
pub async fn get_user_themes() -> Result<Vec<UserTheme>, String> {
    let dir = match user_themes_dir() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    if !dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut themes: Vec<UserTheme> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("css") {
            continue;
        }

        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Capitalise first letter and replace separators with spaces for display
        let name = {
            let raw = stem.replace('-', " ").replace('_', " ");
            let mut chars = raw.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
            }
        };

        // Wrap the CSS variables in the correct data-theme selector so that the
        // user only needs to write plain `--variable: value;` lines.
        let css = format!("[data-theme=\"{stem}\"] {{\n{content}\n}}");

        themes.push(UserTheme {
            id: stem,
            name,
            css,
        });
    }

    themes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(themes)
}
