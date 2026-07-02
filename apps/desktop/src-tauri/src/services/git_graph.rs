use crate::error::AppError;
use crate::models::{GitCommit, GitGraphEdge, GitSignature};
use crate::utils::short_oid;
use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Palette de couleurs ──────────────────────────────────────────────────────

const COLORS: &[&str] = &[
    "#7c3aed", "#2563eb", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#be185d", "#65a30d",
];

// ─── Structs (match exact avec les types TypeScript) ───────────────────────────

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

/// Assigne à chaque commit une colonne, une couleur et les connexions (lignes SVG) vers ses
/// parents, dans l'ordre de `oids` (déjà paginé/trié par l'appelant via un `Revwalk`).
///
/// C'est l'algorithme de layout du graphe de commits : `active_lanes`/`lane_colors` suivent
/// quelle colonne "attend" quel commit au fur et à mesure qu'on avance dans l'historique, et
/// `color_map` fixe la couleur de chaque commit une seule fois pour qu'elle reste stable le long
/// d'une lane. Les stashes (dont le 2ᵉ+ parent n'est pas un vrai parent de merge) et la branche
/// main/master (colorée différemment en local vs origin) ont un traitement dédié.
pub fn build_graph_nodes(
    repo: &Repository,
    oids: &[Oid],
    stash_oids: &[Oid],
    refs_map: &HashMap<String, Vec<LogRef>>,
    branch: Option<&str>,
) -> Result<Vec<LogGraphNode>, AppError> {
    // active_lanes[i] = Some(oid) signifie que la lane i attend ce commit
    let mut active_lanes: Vec<Option<String>> = Vec::new();
    let mut lane_colors: Vec<String> = Vec::new();
    let mut color_map: HashMap<String, String> = HashMap::new();

    let is_main_or_master = if let Some(b) = branch {
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

    for oid in oids {
        let commit = repo.find_commit(*oid).map_err(AppError::Git)?;
        let oid_str = oid.to_string();
        let short_oid_str = short_oid(&oid_str);
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
            short_oid: short_oid_str,
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
