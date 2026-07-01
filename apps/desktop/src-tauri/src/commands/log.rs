use crate::error::AppError;
use crate::models::{GitCommit, GitGraphEdge, GitSignature};
use git2::{DiffOptions, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;

// ─── Palette de couleurs ──────────────────────────────────────────────────────

const COLORS: &[&str] = &[
    "#7c3aed", "#2563eb", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#be185d", "#65a30d",
];

// ─── Structs locaux (match exact avec les types TypeScript) ───────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogRef {
    pub name: String,
    pub short_name: String,
    #[serde(rename = "type")]
    pub ref_type: String,
    pub commit_oid: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogGraphNode {
    pub commit: GitCommit,
    pub column: usize,
    pub color: String,
    pub connections: Vec<GitGraphEdge>,
    pub refs: Vec<LogRef>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    origin: String,
    content: String,
    old_lineno: Option<i32>,
    new_lineno: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    header: String,
    lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    old_path: String,
    new_path: String,
    status: String,
    additions: usize,
    deletions: usize,
    hunks: Vec<DiffHunk>,
    is_binary: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    files: Vec<DiffFile>,
    total_additions: usize,
    total_deletions: usize,
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Retourne l'historique paginé sous forme de nœuds de graphe
#[tauri::command]
pub async fn get_log(
    path: String,
    limit: Option<usize>,
    skip: Option<usize>,
    branch: Option<String>,
    show_stashes: Option<bool>,
    hidden_stashes: Option<Vec<String>>,
) -> Result<Vec<LogGraphNode>, String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;

    let mut stash_oids = Vec::new();
    let mut stash_refs = Vec::new();
    let _ = repo.stash_foreach(|index, _, commit_oid| {
        stash_oids.push(*commit_oid);
        stash_refs.push((index, commit_oid.to_string()));
        true
    });

    let mut ignored_stash_parent_oids = std::collections::HashSet::new();
    for commit_oid in &stash_oids {
        if let Ok(commit) = repo.find_commit(*commit_oid) {
            for i in 1..commit.parent_count() {
                if let Ok(parent) = commit.parent(i) {
                    ignored_stash_parent_oids.insert(parent.id());
                }
            }
        }
    }

    let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e))?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| AppError::Git(e))?;

    if let Some(ref branch_name) = branch {
        let mut target = None;
        if let Ok(b) = repo.find_branch(branch_name, git2::BranchType::Local) {
            target = b.get().target();
        }
        if target.is_none() {
            if let Ok(b) = repo.find_branch(branch_name, git2::BranchType::Remote) {
                target = b.get().target();
            }
        }
        if target.is_none() {
            if let Ok(remotes) = repo.remotes() {
                for remote in remotes.iter().flatten() {
                    let full_remote_branch = format!("{}/{}", remote, branch_name);
                    if let Ok(b) = repo.find_branch(&full_remote_branch, git2::BranchType::Remote) {
                        target = b.get().target();
                        break;
                    }
                }
            }
        }
        if target.is_none() {
            if let Ok(obj) = repo.revparse_single(branch_name) {
                target = Some(obj.id());
            }
        }
        if target.is_none() {
            let tag_ref = format!("refs/tags/{}", branch_name);
            if let Ok(obj) = repo.revparse_single(&tag_ref) {
                target = Some(obj.id());
            }
        }

        if let Some(oid) = target {
            revwalk.push(oid).map_err(|e| AppError::Git(e))?;
        } else {
            return Err(format!("Could not resolve branch/reference '{}'", branch_name));
        }
    } else {
        // Parcourir toutes les branches et remotes
        let _ = revwalk.push_glob("refs/heads/*");
        let _ = revwalk.push_glob("refs/remotes/*");
        // Parcourir et pousser tous les stashes
        if show_stashes.unwrap_or(true) {
            for oid in &stash_oids {
                let oid_str = oid.to_string();
                if let Some(ref hidden) = hidden_stashes {
                    if hidden.contains(&oid_str) {
                        continue;
                    }
                }
                let _ = revwalk.push(*oid);
            }
        }
        // Fallback HEAD
        if let Ok(head) = repo.head() {
            if let Some(oid) = head.target() {
                let _ = revwalk.push(oid);
            }
        }
    }

    // ── Construction de la map refs (oid → Vec<LogRef>) ──────────────────────
    let mut refs_map: HashMap<String, Vec<LogRef>> = HashMap::new();

    // HEAD – resolve through symbolic refs (normal non-detached HEAD is symbolic: HEAD → refs/heads/main → oid)
    if let Ok(head_ref) = repo.head() {
        // target() returns None for symbolic refs; peel_to_commit resolves them
        let head_oid = head_ref
            .target()
            .or_else(|| head_ref.peel_to_commit().ok().map(|c| c.id()));
        if let Some(oid) = head_oid {
            refs_map
                .entry(oid.to_string())
                .or_default()
                .push(LogRef {
                    name: "HEAD".to_string(),
                    short_name: "HEAD".to_string(),
                    ref_type: "HEAD".to_string(),
                    commit_oid: oid.to_string(),
                });
        }
    }

    if let Ok(references) = repo.references() {
        for reference in references.flatten() {
            let target_oid = match reference.peel_to_commit() {
                Ok(c) => c.id(),
                Err(_) => match reference.target() {
                    Some(o) => o,
                    None => continue,
                },
            };

            let name = match reference.name() {
                Some(n) => n.to_string(),
                None => continue,
            };
            let short_name = reference.shorthand().unwrap_or("").to_string();

            let ref_type = if reference.is_branch() {
                "branch"
            } else if reference.is_tag() {
                "tag"
            } else if reference.is_remote() {
                "remote"
            } else {
                continue;
            };

            refs_map
                .entry(target_oid.to_string())
                .or_default()
                .push(LogRef {
                    name: name.clone(),
                    short_name,
                    ref_type: ref_type.to_string(),
                    commit_oid: target_oid.to_string(),
                });
        }
    }

    // Add stash references to refs_map
    for (index, oid_str) in stash_refs {
        refs_map
            .entry(oid_str.clone())
            .or_default()
            .push(LogRef {
                name: format!("refs/stash@{{{}}}", index),
                short_name: format!("stash@{{{}}}", index),
                ref_type: "stash".to_string(),
                commit_oid: oid_str,
            });
    }

    // ── Collecte des OIDs avec pagination ────────────────────────────────────
    let skip_n = skip.unwrap_or(0);
    let limit_n = limit.unwrap_or(200);

    let oids: Vec<Oid> = revwalk
        .filter_map(|r| r.ok())
        .filter(|oid| !ignored_stash_parent_oids.contains(oid))
        .skip(skip_n)
        .take(limit_n)
        .collect();

    // ── Algorithme de layout de colonnes ─────────────────────────────────────
    // active_lanes[i] = Some(oid) signifie que la lane i attend ce commit
    let mut active_lanes: Vec<Option<String>> = Vec::new();
    let mut lane_colors: Vec<String> = Vec::new();
    let mut color_map: HashMap<String, String> = HashMap::new();

    let is_main_or_master = if let Some(ref b) = branch {
        b == "main" || b == "master"
    } else if let Ok(head) = repo.head() {
        if let Some(shorthand) = head.shorthand() {
            shorthand == "main" || shorthand == "master"
        } else {
            false
        }
    } else {
        false
    };

    let local_main_oid = if is_main_or_master {
        repo.find_reference("refs/heads/main")
            .or_else(|_| repo.find_reference("refs/heads/master"))
            .ok()
            .and_then(|r| r.target())
    } else {
        None
    };

    let origin_main_oid = if is_main_or_master {
        repo.find_reference("refs/remotes/origin/main")
            .or_else(|_| repo.find_reference("refs/remotes/origin/master"))
            .ok()
            .and_then(|r| r.target())
    } else {
        None
    };

    if let Some(oid) = local_main_oid {
        active_lanes.push(Some(oid.to_string()));
        lane_colors.push("#2563eb".to_string()); // Blue for local main
    } else if let Some(oid) = origin_main_oid {
        active_lanes.push(Some(oid.to_string()));
        lane_colors.push("#7c3aed".to_string()); // Purple for origin/main
    }

    if is_main_or_master {
        // Pre-populate color map for main/master branches to differentiate local and remote
        let local_main_colors = [
            ("refs/heads/main", "refs/remotes/origin/main"),
            ("refs/heads/master", "refs/remotes/origin/master"),
        ];

        for (local_ref, remote_ref) in local_main_colors {
            let local_oid = repo.find_reference(local_ref).ok().and_then(|r| r.target());
            let remote_oid = repo.find_reference(remote_ref).ok().and_then(|r| r.target());

            if let Some(oid) = local_oid {
                let mut curr = oid;
                let mut count = 0;
                while count < 1000 {
                    if let Ok(commit) = repo.find_commit(curr) {
                        let curr_str = curr.to_string();
                        if color_map.contains_key(&curr_str) {
                            break;
                        }
                        color_map.insert(curr_str, "#2563eb".to_string()); // Local main/master: Blue
                        if commit.parent_count() > 0 {
                            curr = commit.parent_id(0).unwrap();
                            count += 1;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }

            if let Some(oid) = remote_oid {
                let mut curr = oid;
                let mut count = 0;
                while count < 1000 {
                    if let Ok(commit) = repo.find_commit(curr) {
                        let curr_str = curr.to_string();
                        if color_map.contains_key(&curr_str) {
                            break;
                        }
                        color_map.insert(curr_str, "#7c3aed".to_string()); // Remote main/master: Purple
                        if commit.parent_count() > 0 {
                            curr = commit.parent_id(0).unwrap();
                            count += 1;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }

    let mut color_counter: usize = 0;
    let mut nodes: Vec<LogGraphNode> = Vec::new();

    for oid in &oids {
        let commit = repo.find_commit(*oid).map_err(|e| AppError::Git(e))?;
        let oid_str = oid.to_string();
        let short_oid = oid_str[..7.min(oid_str.len())].to_string();
        let mut parent_oids: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
        if stash_oids.contains(oid) {
            if !parent_oids.is_empty() {
                parent_oids.truncate(1);
            }
        }

        let mut col_override = None;
        if stash_oids.contains(oid) {
            if let Some(p0) = parent_oids.first() {
                if let Some(idx) = active_lanes.iter().position(|l| l.as_deref() == Some(p0.as_str())) {
                    col_override = Some(idx);
                }
            }
        }

        // Assigner la couleur du commit courant (stable par lane, propagée au 1er parent)
        let mut color = color_map
            .entry(oid_str.clone())
            .or_insert_with(|| {
                let c = COLORS[color_counter % COLORS.len()].to_string();
                color_counter += 1;
                c
            })
            .clone();

        if let Some(idx) = col_override {
            if idx < lane_colors.len() && !lane_colors[idx].is_empty() {
                color = lane_colors[idx].clone();
                color_map.insert(oid_str.clone(), color.clone());
            }
        }

        let mut is_new_lane = false;

        // S'assurer que ce commit est dans active_lanes (nouveau nœud non attendu)
        if let Some(idx) = col_override {
            active_lanes[idx] = Some(oid_str.clone());
        } else if !active_lanes
            .iter()
            .any(|l| l.as_deref() == Some(oid_str.as_str()))
        {
            is_new_lane = true;
            if let Some(empty_idx) = active_lanes.iter().position(|l| l.is_none()) {
                active_lanes[empty_idx] = Some(oid_str.clone());
                if empty_idx < lane_colors.len() {
                    lane_colors[empty_idx] = color.clone();
                } else {
                    lane_colors.resize(empty_idx + 1, String::new());
                    lane_colors[empty_idx] = color.clone();
                }
            } else {
                active_lanes.push(Some(oid_str.clone()));
                lane_colors.push(color.clone());
            }
        }

        // Trouver toutes les colonnes de ce commit (merge possible de plusieurs lanes)
        let merge_cols: Vec<usize> = active_lanes
            .iter()
            .enumerate()
            .filter(|(_, l)| l.as_deref() == Some(oid_str.as_str()))
            .map(|(i, _)| i)
            .collect();

        let col = merge_cols[0];

        // ── Calcul de next_lanes ──────────────────────────────────────────────
        let mut next_lanes = active_lanes.clone();
        let mut next_lane_colors = lane_colors.clone();

        // Effacer toutes les occurrences de ce commit
        for &mc in &merge_cols {
            next_lanes[mc] = None;
        }

        let mut parent_to_col = HashMap::new();

        // Premier parent : prend la colonne principale (col)
        if let Some(p0) = parent_oids.first() {
            next_lanes[col] = Some(p0.clone());
            next_lane_colors[col] = color.clone();
            parent_to_col.insert(p0.clone(), col);
            // Propager la couleur au premier parent
            color_map.entry(p0.clone()).or_insert_with(|| color.clone());
        }

        // Parents supplémentaires : nouvelles lanes
        for p in parent_oids.iter().skip(1) {
            let target_col = if let Some(existing_idx) = next_lanes
                .iter()
                .position(|l| l.as_deref() == Some(p.as_str()))
            {
                existing_idx
            } else {
                let new_idx = next_lanes
                    .iter()
                    .position(|l| l.is_none())
                    .unwrap_or_else(|| {
                        next_lanes.push(None);
                        next_lane_colors.push(String::new());
                        next_lanes.len() - 1
                    });
                next_lanes[new_idx] = Some(p.clone());
                let p_color = color_map.entry(p.clone()).or_insert_with(|| {
                    let c = COLORS[color_counter % COLORS.len()].to_string();
                    color_counter += 1;
                    c
                }).clone();
                next_lane_colors[new_idx] = p_color;
                new_idx
            };
            parent_to_col.insert(p.clone(), target_col);
        }

        // Nettoyer les None en fin de vecteur
        while next_lanes.last() == Some(&None) {
            next_lanes.pop();
            next_lane_colors.pop();
        }

        // ── Calcul des connexions (lignes full-row pour le SVG) ───────────────
        let mut connections: Vec<GitGraphEdge> = Vec::new();

        // 1. Lanes pass-through (non liées à ce commit)
        for (from_col, lane_oid) in active_lanes.iter().enumerate() {
            if let Some(ref oid) = lane_oid {
                if oid == &oid_str {
                    continue; // La lane de ce commit : gérée via merge/outgoing
                }
                // Une lane pass-through reste toujours dans la même colonne et garde sa couleur
                let edge_color = lane_colors.get(from_col).cloned().unwrap_or_else(|| "#888888".to_string());
                connections.push(GitGraphEdge {
                    from_column: from_col,
                    to_column: from_col,
                    color: edge_color,
                    dashed: None,
                    starts_at_node: None,
                    ends_at_node: None,
                });
            }
        }

        // 2. Lignes de merge entrant (colonnes secondaires → col principal)
        for &mc in &merge_cols {
            let edge_color = lane_colors.get(mc).cloned().unwrap_or_else(|| color.clone());
            if mc != col {
                connections.push(GitGraphEdge {
                    from_column: mc,
                    to_column: col,
                    color: edge_color,
                    dashed: None,
                    starts_at_node: None,
                    ends_at_node: None,
                });
            } else if !is_new_lane {
                connections.push(GitGraphEdge {
                    from_column: col,
                    to_column: col,
                    color: edge_color,
                    dashed: None,
                    starts_at_node: None,
                    ends_at_node: Some(true),
                });
            }
        }

        // 3. Lignes sortantes vers les parents
        for p_oid in &parent_oids {
            if let Some(&to_col) = parent_to_col.get(p_oid) {
                let edge_color = next_lane_colors.get(to_col).cloned().unwrap_or_else(|| color.clone());
                let starts_at_node = if to_col == col { Some(true) } else { None };
                connections.push(GitGraphEdge {
                    from_column: col,
                    to_column: to_col,
                    color: edge_color,
                    dashed: None,
                    starts_at_node,
                    ends_at_node: None,
                });
            }
        }

        active_lanes = next_lanes;
        lane_colors = next_lane_colors;

        // ── Construction du commit ────────────────────────────────────────────
        let author = commit.author();
        let committer = commit.committer();
        let raw_message = commit.message().unwrap_or("").to_string();
        let subject = raw_message.lines().next().unwrap_or("").to_string();
        let body = raw_message
            .lines()
            .skip(2)
            .collect::<Vec<_>>()
            .join("\n");

        let git_commit = GitCommit {
            oid: oid_str.clone(),
            short_oid,
            message: raw_message,
            subject,
            body,
            author: GitSignature {
                name: author.name().unwrap_or("").to_string(),
                email: author.email().unwrap_or("").to_string(),
                timestamp: author.when().seconds(),
            },
            committer: GitSignature {
                name: committer.name().unwrap_or("").to_string(),
                email: committer.email().unwrap_or("").to_string(),
                timestamp: committer.when().seconds(),
            },
            parent_oids,
        };

        let mut refs = refs_map.get(&oid_str).cloned().unwrap_or_default();
        if stash_oids.contains(oid) {
            refs.retain(|r| r.ref_type == "stash");
        }

        nodes.push(LogGraphNode {
            commit: git_commit,
            column: col,
            color,
            connections,
            refs,
        });
    }

    // Add dashed line for origin/main up to the top of the graph
    if let Some(origin_oid) = origin_main_oid {
        let origin_oid_str = origin_oid.to_string();
        if let Some(origin_node_idx) = nodes.iter().position(|n| n.commit.oid == origin_oid_str) {
            for i in 0..origin_node_idx {
                let has_col_0_connection = nodes[i].connections.iter().any(|c| c.from_column == 0 || c.to_column == 0);
                if !has_col_0_connection {
                    nodes[i].connections.push(GitGraphEdge {
                        from_column: 0,
                        to_column: 0,
                        color: "#7c3aed".to_string(), // Purple
                        dashed: Some(true),
                        starts_at_node: None,
                        ends_at_node: None,
                    });
                }
            }
        } else {
            // If origin/main is not in the current page, but we have local commits in this page,
            // draw the dashed line on column 0 through the entire page.
            for node in &mut nodes {
                let has_col_0_connection = node.connections.iter().any(|c| c.from_column == 0 || c.to_column == 0);
                if !has_col_0_connection {
                    node.connections.push(GitGraphEdge {
                        from_column: 0,
                        to_column: 0,
                        color: "#7c3aed".to_string(), // Purple
                        dashed: Some(true),
                        starts_at_node: None,
                        ends_at_node: None,
                    });
                }
            }
        }
    }

    Ok(nodes)
}

fn diff_foreach_files(
    diff: &git2::Diff,
    files: &RefCell<Vec<DiffFile>>,
    is_untracked: bool,
) -> Result<(), git2::Error> {
    diff.foreach(
        &mut |delta, _progress| {
            let old_path = delta
                .old_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let new_path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let status = if is_untracked {
                "untracked"
            } else {
                match delta.status() {
                    git2::Delta::Added => "added",
                    git2::Delta::Deleted => "deleted",
                    git2::Delta::Renamed => "renamed",
                    git2::Delta::Copied => "copied",
                    git2::Delta::Typechange => "typechange",
                    _ => "modified",
                }
            };
            let is_binary =
                delta.old_file().is_binary() || delta.new_file().is_binary();

            files.borrow_mut().push(DiffFile {
                old_path,
                new_path,
                status: status.to_string(),
                additions: 0,
                deletions: 0,
                hunks: Vec::new(),
                is_binary,
            });
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            let header = std::str::from_utf8(hunk.header())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            if let Some(file) = files.borrow_mut().last_mut() {
                file.hunks.push(DiffHunk {
                    header,
                    lines: Vec::new(),
                });
            }
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            let origin = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "\\",
            };
            let mut f = files.borrow_mut();
            if let Some(file) = f.last_mut() {
                match origin {
                    "+" => file.additions += 1,
                    "-" => file.deletions += 1,
                    _ => {}
                }
                if let Some(hunk) = file.hunks.last_mut() {
                    hunk.lines.push(DiffLine {
                        origin: origin.to_string(),
                        content,
                        old_lineno: line.old_lineno().map(|n| n as i32),
                        new_lineno: line.new_lineno().map(|n| n as i32),
                    });
                }
            }
            true
        }),
    )
}

/// Retourne le diff complet d'un commit vs son premier parent
#[tauri::command]
pub async fn get_commit_diff(path: String, oid: String) -> Result<CommitDiff, String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let commit_oid = Oid::from_str(&oid).map_err(|e| AppError::Git(e))?;

    // Check if the commit is a stash commit
    let mut is_stash = false;
    let _ = repo.stash_foreach(|_index, _message, stash_oid| {
        if *stash_oid == commit_oid {
            is_stash = true;
            false
        } else {
            true
        }
    });

    let commit = repo.find_commit(commit_oid).map_err(|e| AppError::Git(e))?;

    let commit_tree = commit.tree().map_err(|e| AppError::Git(e))?;
    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(|e| AppError::Git(e))?;
        Some(parent.tree().map_err(|e| AppError::Git(e))?)
    } else {
        None
    };

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )
        .map_err(|e| AppError::Git(e))?;

    let files: RefCell<Vec<DiffFile>> = RefCell::new(Vec::new());

    diff_foreach_files(&diff, &files, false).map_err(|e| AppError::Git(e).to_string())?;

    if is_stash && commit.parent_count() == 3 {
        if let Ok(untracked_parent) = commit.parent(2) {
            if let Ok(untracked_tree) = untracked_parent.tree() {
                if let Ok(untracked_diff) = repo.diff_tree_to_tree(
                    None,
                    Some(&untracked_tree),
                    Some(&mut diff_opts),
                ) {
                    let _ = diff_foreach_files(&untracked_diff, &files, true);
                }
            }
        }
    }

    let files_out = files.into_inner();
    let total_additions = files_out.iter().map(|f| f.additions).sum();
    let total_deletions = files_out.iter().map(|f| f.deletions).sum();

    Ok(CommitDiff {
        files: files_out,
        total_additions,
        total_deletions,
    })
}

/// Retourne le contenu brut d'un fichier à un commit donné
#[tauri::command]
pub async fn get_commit_file(
    path: String,
    oid: String,
    file_path: String,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let commit_oid = Oid::from_str(&oid).map_err(|e| AppError::Git(e))?;
    let commit = repo.find_commit(commit_oid).map_err(|e| AppError::Git(e))?;
    let tree = commit.tree().map_err(|e| AppError::Git(e))?;

    let entry = tree
        .get_path(std::path::Path::new(&file_path))
        .map_err(|e| AppError::Git(e))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| AppError::Git(e))?;

    let content = std::str::from_utf8(blob.content())
        .map_err(|_| AppError::Unknown("File content is not valid UTF-8".to_string()))?
        .to_string();

    Ok(content)
}
