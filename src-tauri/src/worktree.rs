use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::sys::{git_command, repository_toplevel, run_git, validate_branch_name};

/// Sibling directory (next to the repository) that shelters all helm-managed
/// worktrees. Nested per repo name so two projects with the same branch names
/// never collide.
const WORKTREES_DIR: &str = ".helm-worktrees";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    /// None for a detached-HEAD or bare worktree.
    pub branch: Option<String>,
    pub head: Option<String>,
    /// Count of changed entries (`git status --porcelain` lines); 0 = clean.
    pub dirty: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeAdded {
    pub path: String,
}

#[tauri::command]
pub async fn worktree_list(repo: String) -> Result<Vec<WorktreeInfo>, String> {
    let toplevel = repository_toplevel(&repo)?;
    let output = run_git(&toplevel, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = parse_worktree_list(&String::from_utf8_lossy(&output.stdout));

    for worktree in &mut worktrees {
        worktree.dirty = dirty_count(&worktree.path);
    }
    Ok(worktrees)
}

#[tauri::command]
pub async fn worktree_add(
    repo: String,
    branch: String,
    base: Option<String>,
) -> Result<WorktreeAdded, String> {
    let toplevel = repository_toplevel(&repo)?;
    validate_branch_name(&toplevel, &branch)?;

    let target = worktree_target_path(&toplevel, &branch)?;
    if target.exists() {
        return Err(format!(
            "worktree path already exists: {}",
            target.display()
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }

    let target_str = target.to_string_lossy().into_owned();
    if branch_exists(&toplevel, &branch)? {
        run_git(
            &toplevel,
            &["worktree", "add", "--", target_str.as_str(), branch.as_str()],
        )?;
    } else {
        let base = base
            .as_deref()
            .map(str::trim)
            .filter(|base| !base.is_empty())
            .unwrap_or("HEAD");
        run_git(
            &toplevel,
            &[
                "worktree",
                "add",
                "-b",
                branch.as_str(),
                "--",
                target_str.as_str(),
                base,
            ],
        )?;
    }

    Ok(WorktreeAdded { path: target_str })
}

#[tauri::command]
pub async fn worktree_remove(
    repo: String,
    path: String,
    force: Option<bool>,
) -> Result<(), String> {
    let toplevel = repository_toplevel(&repo)?;
    let output = run_git(&toplevel, &["worktree", "list", "--porcelain"])?;
    let worktrees = parse_worktree_list(&String::from_utf8_lossy(&output.stdout));

    // The main worktree is always the first porcelain entry. Refuse it, and
    // refuse paths git does not know about — this command must never become a
    // generic directory deleter.
    let main_path = worktrees
        .first()
        .map(|worktree| worktree.path.clone())
        .ok_or_else(|| "git reported no worktrees".to_string())?;
    if same_path(&path, &main_path) {
        return Err("refusing to remove the main worktree".to_string());
    }
    if !worktrees
        .iter()
        .any(|worktree| same_path(&path, &worktree.path))
    {
        return Err(format!("not a worktree of this repository: {path}"));
    }

    let mut args = vec!["worktree", "remove"];
    if force.unwrap_or(false) {
        args.push("--force");
    }
    args.push("--");
    args.push(path.as_str());
    run_git(&toplevel, &args).map(|_| ())
}

fn worktree_target_path(toplevel: &str, branch: &str) -> Result<PathBuf, String> {
    let toplevel_path = Path::new(toplevel);
    let parent = toplevel_path
        .parent()
        .ok_or_else(|| format!("repository has no parent directory: {toplevel}"))?;
    let repo_name = toplevel_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| format!("repository has no name: {toplevel}"))?;

    Ok(parent
        .join(WORKTREES_DIR)
        .join(repo_name)
        .join(branch_slug(branch)?))
}

/// Branch names may contain `/` (helm/<slug>-<seat>); flatten to one safe path
/// component so the worktree directory nests predictably.
fn branch_slug(branch: &str) -> Result<String, String> {
    let slug: String = branch
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric()
                || character == '.'
                || character == '_'
                || character == '-'
            {
                character
            } else {
                '-'
            }
        })
        .collect();
    let slug = slug
        .trim_start_matches(['-', '.'])
        .trim_end_matches('-')
        .to_string();

    if slug.is_empty() {
        return Err(format!("branch produces an empty directory name: {branch}"));
    }
    Ok(slug)
}

fn branch_exists(toplevel: &str, branch: &str) -> Result<bool, String> {
    let reference = format!("refs/heads/{branch}");
    let mut command = git_command(toplevel)?;
    let output = command
        .args(["show-ref", "--verify", "--quiet", reference.as_str()])
        .output()
        .map_err(|error| format!("Failed to run git: {error}"))?;
    Ok(output.status.success())
}

fn dirty_count(worktree_path: &str) -> u32 {
    if !Path::new(worktree_path).is_dir() {
        return 0;
    }
    let Ok(output) = run_git(worktree_path, &["status", "--porcelain"]) else {
        return 0;
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32
}

/// Path equality that survives `/` vs `\` and unresolved symlinks; falls back
/// to a separator-normalized string compare when canonicalization fails
/// (e.g. a prunable worktree whose directory is gone).
fn same_path(left: &str, right: &str) -> bool {
    match (
        fs::canonicalize(left),
        fs::canonicalize(right),
    ) {
        (Ok(left), Ok(right)) => left == right,
        _ => left.replace('\\', "/").trim_end_matches('/')
            == right.replace('\\', "/").trim_end_matches('/'),
    }
}

fn parse_worktree_list(text: &str) -> Vec<WorktreeInfo> {
    let mut worktrees = Vec::new();
    let mut current: Option<WorktreeInfo> = None;

    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(worktree) = current.take() {
                worktrees.push(worktree);
            }
            current = Some(WorktreeInfo {
                path: path.to_string(),
                branch: None,
                head: None,
                dirty: 0,
            });
        } else if let Some(head) = line.strip_prefix("HEAD ") {
            if let Some(worktree) = current.as_mut() {
                worktree.head = Some(head.to_string());
            }
        } else if let Some(branch) = line.strip_prefix("branch ") {
            if let Some(worktree) = current.as_mut() {
                worktree.branch = Some(
                    branch
                        .strip_prefix("refs/heads/")
                        .unwrap_or(branch)
                        .to_string(),
                );
            }
        }
    }
    if let Some(worktree) = current.take() {
        worktrees.push(worktree);
    }
    worktrees
}

#[cfg(test)]
mod tests {
    use super::{branch_slug, parse_worktree_list};

    #[test]
    fn parses_porcelain_worktree_list() {
        let worktrees = parse_worktree_list(concat!(
            "worktree /projects/helm\n",
            "HEAD abc123\n",
            "branch refs/heads/main\n",
            "\n",
            "worktree /projects/.helm-worktrees/helm/helm-fix-gpt\n",
            "HEAD def456\n",
            "branch refs/heads/helm/fix-gpt\n",
            "\n",
            "worktree /projects/detached\n",
            "HEAD 0123abc\n",
            "detached\n",
        ));

        assert_eq!(worktrees.len(), 3);
        assert_eq!(worktrees[0].path, "/projects/helm");
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert_eq!(worktrees[0].head.as_deref(), Some("abc123"));
        assert_eq!(
            worktrees[1].branch.as_deref(),
            Some("helm/fix-gpt")
        );
        assert_eq!(worktrees[2].branch, None);
    }

    #[test]
    fn slugs_branch_names_into_one_component() {
        assert_eq!(branch_slug("helm/fix-gpt").unwrap(), "helm-fix-gpt");
        assert_eq!(branch_slug("feature_x.1").unwrap(), "feature_x.1");
        assert!(branch_slug("///").is_err());
    }
}
