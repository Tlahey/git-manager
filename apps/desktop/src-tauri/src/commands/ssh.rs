use std::process::Command;
use std::path::PathBuf;
use std::fs;

#[tauri::command]
pub async fn generate_ssh_key(
    key_type: String,
    bits: Option<u32>,
    comment: String,
    path: String,
    passphrase: Option<String>,
) -> Result<String, String> {
    let expanded_path = if path.starts_with("~/") {
        let home = std::env::var("HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                #[allow(deprecated)]
                std::env::home_dir()
            })
            .ok_or_else(|| "Could not locate home directory".to_string())?;
        home.join(&path[2..])
    } else {
        PathBuf::from(&path)
    };

    // Ensure parent directory exists
    if let Some(parent) = expanded_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut cmd = Command::new("ssh-keygen");
    cmd.arg("-t").arg(&key_type);
    
    if key_type == "rsa" {
        if let Some(b) = bits {
            cmd.arg("-b").arg(b.to_string());
        } else {
            cmd.arg("-b").arg("3072");
        }
    }
    
    cmd.arg("-C").arg(&comment);
    cmd.arg("-f").arg(&expanded_path);
    cmd.arg("-N").arg(&passphrase.unwrap_or_default());
    cmd.arg("-q"); // quiet
    
    let output = cmd.output().map_err(|e| format!("Failed to run ssh-keygen: {}", e))?;
    
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(format!("ssh-keygen failed: {}", err_msg));
    }

    // Read generated public key
    let pub_key_path = expanded_path.with_extension("pub");
    let pub_key_content = fs::read_to_string(&pub_key_path)
        .map_err(|e| format!("Failed to read public key: {}", e))?;

    Ok(pub_key_content)
}

#[tauri::command]
pub async fn read_ssh_public_key(path: String) -> Result<String, String> {
    let mut expanded_path = if path.starts_with("~/") {
        let home = std::env::var("HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                #[allow(deprecated)]
                std::env::home_dir()
            })
            .ok_or_else(|| "Could not locate home directory".to_string())?;
        home.join(&path[2..])
    } else {
        PathBuf::from(&path)
    };

    if expanded_path.exists() && expanded_path.is_file() {
        if expanded_path.extension().and_then(|ext| ext.to_str()) != Some("pub") {
            let pub_path = expanded_path.with_extension("pub");
            if pub_path.exists() {
                expanded_path = pub_path;
            }
        }
    } else {
        let pub_path = expanded_path.with_extension("pub");
        if pub_path.exists() {
            expanded_path = pub_path;
        } else {
            return Err("File does not exist".to_string());
        }
    }

    let content = fs::read_to_string(&expanded_path)
        .map_err(|e| format!("Failed to read public key: {}", e))?;
    Ok(content)
}
