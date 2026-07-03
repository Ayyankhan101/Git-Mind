use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;
use std::process::Command;

/// Batch git blame for multiple findings grouped by file.
#[pyfunction]
pub fn batch_blame(
    py: Python<'_>,
    findings: Vec<(String, u32)>,
    local_path: String,
) -> Vec<PyObject> {
    // Group findings by file
    let mut by_file: HashMap<String, Vec<u32>> = HashMap::new();
    for (file, line) in &findings {
        by_file.entry(file.clone()).or_default().push(*line);
    }

    for lines in by_file.values_mut() {
        lines.sort_unstable();
        lines.dedup();
    }

    let mut blame_map: HashMap<String, HashMap<u32, PyObject>> = HashMap::new();

    for (file, lines) in &by_file {
        let mut full_args: Vec<String> = vec!["blame".into(), "--porcelain".into()];
        for line in lines {
            full_args.push("-L".into());
            full_args.push(format!("{},{}", line, line));
        }
        full_args.push(file.clone());

        let output = match Command::new("git")
            .args(&full_args)
            .current_dir(&local_path)
            .output()
        {
            Ok(o) => o,
            Err(_) => continue,
        };

        if !output.status.success() || output.stdout.is_empty() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parsed = parse_porcelain_batch(&stdout);

        let mut file_map: HashMap<u32, PyObject> = HashMap::new();
        for (line, info) in parsed {
            let d = PyDict::new(py);
            for (k, v) in &info {
                d.set_item(k, v).ok();
            }
            file_map.insert(line, d.into());
        }

        blame_map.insert(file.clone(), file_map);
    }

    findings
        .iter()
        .map(|(file, line)| {
            blame_map
                .get(file)
                .and_then(|m| m.get(line))
                .map(|v| v.clone_ref(py))
                .unwrap_or_else(|| {
                    let d = PyDict::new(py);
                    d.into()
                })
        })
        .collect()
}

/// Parse porcelain blame output for multiple -L ranges.
///
/// The compact format only shows full author info for the first occurrence
/// of a commit. Subsequent occurrences of the same commit just have the
/// header line followed by the content line. We carry forward the last
/// commit's author info for reuse.
fn parse_porcelain_batch(output: &str) -> HashMap<u32, HashMap<String, String>> {
    let mut result: HashMap<u32, HashMap<String, String>> = HashMap::new();
    let mut last_commit_info: HashMap<String, String> = HashMap::new();
    let mut current_line: Option<u32> = None;
    let mut current_info: HashMap<String, String> = HashMap::new();

    for raw_line in output.lines() {
        if raw_line.starts_with('\t') {
            if let Some(line) = current_line.take() {
                if !current_info.contains_key("author") {
                    for (k, v) in &last_commit_info {
                        current_info.entry(k.clone()).or_insert_with(|| v.clone());
                    }
                }
                if current_info.len() >= 2 {
                    result.insert(line, current_info.clone());
                }
                current_info.clear();
            }
            continue;
        }

        // Check known key-value patterns FIRST (before the generic parts.len() >= 3 check)
        // because "author Muhammad Asif Khan" has 4 parts and would incorrectly match
        // the commit header pattern.
        if let Some(stripped) = raw_line.strip_prefix("author ") {
            let val = stripped.trim().to_string();
            current_info.insert("author".to_string(), val.clone());
            last_commit_info.insert("author".to_string(), val);
        } else if let Some(stripped) = raw_line.strip_prefix("author-mail ") {
            let email = stripped
                .trim()
                .trim_matches(|c| c == '<' || c == '>')
                .to_string();
            current_info.insert("author_email".to_string(), email.clone());
            last_commit_info.insert("author_email".to_string(), email);
        } else if let Some(stripped) = raw_line.strip_prefix("author-time ") {
            if let Ok(ts) = stripped.trim().parse::<i64>() {
                let days = ts / 86400;
                let date = format!(
                    "{}-{:02}-{:02}",
                    1970 + (days as f64 / 365.25) as i64,
                    ((days % 365) / 30) + 1,
                    (days % 30) + 1,
                );
                current_info.insert("date".to_string(), date.clone());
                last_commit_info.insert("date".to_string(), date);
            }
        } else if let Some(stripped) = raw_line.strip_prefix("summary ") {
            let msg = stripped.trim().to_string();
            current_info.insert("commit_message".to_string(), msg.clone());
            last_commit_info.insert("commit_message".to_string(), msg);
        } else {
            // Commit header line: <40-char-hex-hash> <orig> <final> [<num>]
            let parts: Vec<&str> = raw_line.split_whitespace().collect();
            if parts.len() >= 3
                && parts[0].len() >= 40
                && parts[0].chars().all(|c| c.is_ascii_hexdigit())
            {
                if let Some(line) = current_line.take() {
                    if !current_info.contains_key("author") {
                        for (k, v) in &last_commit_info {
                            current_info.entry(k.clone()).or_insert_with(|| v.clone());
                        }
                    }
                    if current_info.len() >= 2 {
                        result.insert(line, current_info.clone());
                    }
                    current_info.clear();
                }

                if let Ok(final_line) = parts[2].parse::<u32>() {
                    current_line = Some(final_line);
                    let hash = parts[0][..8.min(parts[0].len())].to_string();
                    current_info.insert("commit_hash".to_string(), hash);
                }
            }
        }
    }

    if let Some(line) = current_line {
        if !current_info.contains_key("author") {
            for (k, v) in &last_commit_info {
                current_info.entry(k.clone()).or_insert_with(|| v.clone());
            }
        }
        if current_info.len() >= 2 {
            result.insert(line, current_info);
        }
    }

    result
}
