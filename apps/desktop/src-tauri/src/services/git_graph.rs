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
            let remote_oid = repo
                .find_reference(remote_ref)
                .ok()
                .and_then(|r| r.target());

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
                if let Some(idx) = active_lanes
                    .iter()
                    .position(|l| l.as_deref() == Some(p0.as_str()))
                {
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
                let p_color = color_map
                    .entry(p.clone())
                    .or_insert_with(|| {
                        let c = COLORS[color_counter % COLORS.len()].to_string();
                        color_counter += 1;
                        c
                    })
                    .clone();
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
                let edge_color = lane_colors
                    .get(from_col)
                    .cloned()
                    .unwrap_or_else(|| "#888888".to_string());
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
            let edge_color = lane_colors
                .get(mc)
                .cloned()
                .unwrap_or_else(|| color.clone());
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
                let edge_color = next_lane_colors
                    .get(to_col)
                    .cloned()
                    .unwrap_or_else(|| color.clone());
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
        let body = raw_message.lines().skip(2).collect::<Vec<_>>().join("\n");

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

    // ── Pointillés du "pont" reliant chaque stash à son commit de base ────────────
    // Un stash est dessiné *à l'intérieur* de la lane sur laquelle il a été créé (voir le
    // hijack `col_override` plus haut), si bien que la ligne qui relie le nœud du stash à son
    // vrai commit de base — son unique parent (tronqué) — descend le long de cette lane en
    // traversant potentiellement plusieurs lignes de commits sans rapport. Cette ligne n'est pas
    // de l'historique réel : elle doit être en pointillé sur TOUTE sa longueur, pas seulement sur
    // la ligne du stash lui-même. On connaît la colonne exacte (celle du stash, conservée par les
    // lanes pass-through en dessous) et l'oid de base, donc on marque `dashed` sur chaque segment
    // de cette colonne, de la ligne du stash jusqu'à celle de son commit de base (inclus). La
    // ligne *au-dessus* du stash reste pleine : c'est l'historique réel qui passe par là, pas le
    // lien du stash (un stash n'a pas de vrai enfant qui pointe vers lui).
    let stash_oid_set: std::collections::HashSet<String> =
        stash_oids.iter().map(|o| o.to_string()).collect();
    let stash_indices: Vec<usize> = nodes
        .iter()
        .enumerate()
        .filter(|(_, n)| stash_oid_set.contains(&n.commit.oid))
        .map(|(i, _)| i)
        .collect();

    for stash_idx in stash_indices {
        let bridge_col = nodes[stash_idx].column;
        let Some(base_oid) = nodes[stash_idx].commit.parent_oids.first().cloned() else {
            continue;
        };

        // Ligne du stash : uniquement le segment sortant (vers le bas, vers la base).
        for edge in &mut nodes[stash_idx].connections {
            if edge.from_column == bridge_col && edge.starts_at_node == Some(true) {
                edge.dashed = Some(true);
            }
        }

        // Lignes en dessous : pass-through sur la colonne du pont, jusqu'à la ligne de la base.
        for row in &mut nodes[stash_idx + 1..] {
            if row.commit.oid == base_oid {
                // Ligne de la base : le segment qui arrive depuis la colonne du pont (vertical
                // `ends_at_node`, ou merge diagonal vers le nœud). On exclut le segment *sortant*
                // de la base (`starts_at_node`) : le lien de la base vers son propre parent est
                // de l'historique réel.
                for edge in &mut row.connections {
                    if edge.from_column == bridge_col
                        && edge.starts_at_node != Some(true)
                        && (edge.ends_at_node == Some(true) || edge.to_column == row.column)
                    {
                        edge.dashed = Some(true);
                    }
                }
                break;
            }
            for edge in &mut row.connections {
                if edge.from_column == bridge_col && edge.to_column == bridge_col {
                    edge.dashed = Some(true);
                }
            }
        }
    }

    // Add dashed line for origin/main up to the top of the graph
    if let Some(origin_oid) = origin_main_oid {
        let origin_oid_str = origin_oid.to_string();
        if let Some(origin_node_idx) = nodes.iter().position(|n| n.commit.oid == origin_oid_str) {
            for i in 0..origin_node_idx {
                let has_col_0_connection = nodes[i]
                    .connections
                    .iter()
                    .any(|c| c.from_column == 0 || c.to_column == 0);
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
                let has_col_0_connection = node
                    .connections
                    .iter()
                    .any(|c| c.from_column == 0 || c.to_column == 0);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use std::path::Path;

    /// Commits `content` to `name` on top of the current HEAD, returning the new commit oid.
    /// The first call (unborn HEAD) creates the root commit.
    fn commit_file(repo: &Repository, name: &str, content: &str, msg: &str) -> Oid {
        let workdir = repo.workdir().unwrap();
        std::fs::write(workdir.join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let sig = get_git_signature(repo).unwrap();
        let parent = repo
            .head()
            .ok()
            .and_then(|h| h.target())
            .and_then(|o| repo.find_commit(o).ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .unwrap()
    }

    /// Builds a repo shaped like the bug report: `main` is C1→C2→C3→C4, a stash `S` was created
    /// while HEAD was at C2 (so its truncated single parent is C2), and a side commit `F1` hangs
    /// off C1 to force an unrelated lane. Returns the temp dir plus every oid of interest.
    struct Fixture {
        dir: std::path::PathBuf,
        repo: Repository,
        c1: Oid,
        c2: Oid,
        c3: Oid,
        c4: Oid,
        s: Oid,
        f1: Oid,
    }

    fn build_stash_fixture(name: &str) -> Fixture {
        let dir =
            std::env::temp_dir().join(format!("gm-test-graph-{}-{}", name, std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let mut repo = Repository::init(&dir).unwrap();

        let c1 = commit_file(&repo, "file.txt", "one\n", "c1");
        let c2 = commit_file(&repo, "file.txt", "two\n", "c2");

        // Stash a tracked change while HEAD is at C2 → S has base parent C2.
        std::fs::write(dir.join("file.txt"), "dirty\n").unwrap();
        let sig = get_git_signature(&repo).unwrap();
        let s = repo.stash_save2(&sig, Some("wip on c2"), None).unwrap();

        let c3 = commit_file(&repo, "file.txt", "three\n", "c3");
        let c4 = commit_file(&repo, "file.txt", "four\n", "c4");

        // Side commit off C1, without moving HEAD, to force an extra lane between S and C2.
        // Scoped so the borrowed `Commit`/`Tree` drop before `repo` is moved into `Fixture`.
        let f1 = {
            let c1_commit = repo.find_commit(c1).unwrap();
            let c1_tree = c1_commit.tree().unwrap();
            repo.commit(None, &sig, &sig, "f1", &c1_tree, &[&c1_commit])
                .unwrap()
        };

        Fixture {
            dir,
            repo,
            c1,
            c2,
            c3,
            c4,
            s,
            f1,
        }
    }

    fn node(nodes: &[LogGraphNode], oid: Oid) -> &LogGraphNode {
        let oid_str = oid.to_string();
        nodes
            .iter()
            .find(|n| n.commit.oid == oid_str)
            .unwrap_or_else(|| panic!("node {oid_str} not found"))
    }

    /// A stash several rows above its base commit: every segment of the connecting line, across
    /// the unrelated intermediate row, must be dashed — while the real history above the stash and
    /// the base's own link to its parent stay solid.
    #[test]
    fn stash_bridge_is_dashed_across_intermediate_rows() {
        let f = build_stash_fixture("bridge");
        let refs_map: HashMap<String, Vec<LogRef>> = HashMap::new();
        // Display order places F1 (an unrelated commit) between the stash and its base commit.
        let oids = vec![f.c4, f.c3, f.s, f.f1, f.c2, f.c1];

        let nodes = build_graph_nodes(&f.repo, &oids, &[f.s], &refs_map, Some("dev")).unwrap();

        let stash = node(&nodes, f.s);
        let bridge_col = stash.column;

        // Stash's own row: the outgoing (downward) segment is dashed …
        assert!(
            stash.connections.iter().any(|e| e.from_column == bridge_col
                && e.to_column == bridge_col
                && e.starts_at_node == Some(true)
                && e.dashed == Some(true)),
            "stash outgoing segment should be dashed: {:?}",
            stash.connections
        );
        // … but the line arriving from above (real branch history) stays solid.
        assert!(
            stash.connections.iter().any(|e| e.from_column == bridge_col
                && e.to_column == bridge_col
                && e.ends_at_node == Some(true)
                && e.dashed.is_none()),
            "stash incoming segment (real history) should stay solid: {:?}",
            stash.connections
        );

        // Intermediate row: the pass-through segment on the bridge column is dashed.
        let inter = node(&nodes, f.f1);
        assert!(
            inter.connections.iter().any(|e| e.from_column == bridge_col
                && e.to_column == bridge_col
                && e.starts_at_node.is_none()
                && e.ends_at_node.is_none()
                && e.dashed == Some(true)),
            "intermediate pass-through on bridge column should be dashed: {:?}",
            inter.connections
        );

        // Base row: the segment arriving from the bridge column is dashed …
        let base = node(&nodes, f.c2);
        assert!(
            base.connections.iter().any(|e| e.from_column == bridge_col
                && e.ends_at_node == Some(true)
                && e.dashed == Some(true)),
            "base incoming segment should be dashed: {:?}",
            base.connections
        );
        // … while the base's own link to its parent (real history) stays solid.
        assert!(
            base.connections.iter().any(|e| e.from_column == bridge_col
                && e.starts_at_node == Some(true)
                && e.dashed.is_none()),
            "base outgoing segment (real history) should stay solid: {:?}",
            base.connections
        );

        std::fs::remove_dir_all(&f.dir).ok();
    }

    /// A stash directly above its base (no intermediate rows) — both halves of the connector
    /// (stash outgoing + base incoming) are dashed, and no real-history segment is touched.
    #[test]
    fn stash_bridge_is_dashed_when_base_is_adjacent() {
        let f = build_stash_fixture("adjacent");
        let refs_map: HashMap<String, Vec<LogRef>> = HashMap::new();
        let oids = vec![f.c4, f.c3, f.s, f.c2, f.c1];

        let nodes = build_graph_nodes(&f.repo, &oids, &[f.s], &refs_map, Some("dev")).unwrap();

        let stash = node(&nodes, f.s);
        let bridge_col = stash.column;

        assert!(
            stash.connections.iter().any(|e| e.from_column == bridge_col
                && e.starts_at_node == Some(true)
                && e.dashed == Some(true)),
            "stash outgoing segment should be dashed: {:?}",
            stash.connections
        );

        let base = node(&nodes, f.c2);
        assert!(
            base.connections.iter().any(|e| e.from_column == bridge_col
                && e.ends_at_node == Some(true)
                && e.dashed == Some(true)),
            "base incoming segment should be dashed: {:?}",
            base.connections
        );
        assert!(
            base.connections.iter().any(|e| e.from_column == bridge_col
                && e.starts_at_node == Some(true)
                && e.dashed.is_none()),
            "base outgoing segment (real history) should stay solid: {:?}",
            base.connections
        );

        std::fs::remove_dir_all(&f.dir).ok();
    }

    /// Ground truth for the "merge ahead of origin/main" bug: a diamond `b → {p1, s1} → m`
    /// where `origin/main` is `b` (a couple commits behind the local `main` tip `m`, which is the
    /// merge). Rust must leave the merge row entirely SOLID — in particular its straight-down
    /// departure to its real first parent `p1` — because that's real, already-established history;
    /// the "not yet pushed" dashing is layered on later in the frontend (`useGitGraphNodes`), and
    /// this test locks the invariant that Rust itself never dashes those structural edges here.
    #[test]
    fn merge_row_ahead_of_origin_stays_solid_in_rust() {
        let dir = std::env::temp_dir().join(format!("gm-test-graph-merge-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();

        let _r = commit_file(&repo, "file.txt", "r\n", "r");
        let b = commit_file(&repo, "file.txt", "b\n", "b"); // future origin/main
        let p1 = commit_file(&repo, "file.txt", "p1\n", "p1"); // mainline, merge's first parent

        let sig = get_git_signature(&repo).unwrap();
        let (s1, m) = {
            let b_commit = repo.find_commit(b).unwrap();
            let b_tree = b_commit.tree().unwrap();
            let p1_commit = repo.find_commit(p1).unwrap();
            let p1_tree = p1_commit.tree().unwrap();
            // Side branch off `b` (second parent), created without moving HEAD.
            let s1 = repo
                .commit(None, &sig, &sig, "s1", &b_tree, &[&b_commit])
                .unwrap();
            let s1_commit = repo.find_commit(s1).unwrap();
            // Merge on `main`, first parent `p1` (straight down), second parent `s1` (diagonal).
            let m = repo
                .commit(
                    Some("HEAD"),
                    &sig,
                    &sig,
                    "m",
                    &p1_tree,
                    &[&p1_commit, &s1_commit],
                )
                .unwrap();
            (s1, m)
        };

        // origin/main sits a couple commits behind the local tip, at `b`.
        repo.reference("refs/remotes/origin/main", b, true, "origin/main")
            .unwrap();

        let refs_map: HashMap<String, Vec<LogRef>> = HashMap::new();
        // Display order (newest first) — the merge is the first unpushed row.
        let oids = vec![m, p1, s1, b, _r];
        let nodes = build_graph_nodes(&repo, &oids, &[], &refs_map, Some("main")).unwrap();

        let merge = node(&nodes, m);
        assert_eq!(merge.column, 0, "merge sits on the mainline column");

        // Straight-down departure to the first parent — SOLID in Rust.
        assert!(
            merge.connections.iter().any(|e| e.from_column == 0
                && e.to_column == 0
                && e.starts_at_node == Some(true)
                && e.dashed.is_none()),
            "merge's first-parent departure must be solid in Rust: {:?}",
            merge.connections
        );
        // Diagonal to the side branch (second parent) — SOLID.
        assert!(
            merge
                .connections
                .iter()
                .any(|e| e.from_column == 0 && e.to_column == 1 && e.dashed.is_none()),
            "merge's diagonal to the side branch must be solid: {:?}",
            merge.connections
        );
        // Rust adds NO dashing to the merge row (it already carries column-0 edges, so the
        // origin-boundary block's "only fill in if missing" leaves it untouched).
        assert!(
            merge.connections.iter().all(|e| e.dashed.is_none()),
            "Rust must leave every merge-row edge solid: {:?}",
            merge.connections
        );

        std::fs::remove_dir_all(&dir).ok();
    }
}
