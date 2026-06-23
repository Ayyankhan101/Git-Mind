use pyo3::prelude::*;
use pyo3::types::PyDict;
use regex::Regex;

#[pyfunction]
pub fn parse_dependencies(py: Python<'_>, file_contents: std::collections::HashMap<String, String>) -> Vec<PyObject> {
    let has_npm_lock = file_contents.keys().any(|fp| {
        let fname = fp.rsplit('/').next().unwrap_or(fp);
        matches!(fname, "package-lock.json" | "yarn.lock" | "pnpm-lock.yaml")
    });
    let has_py_lock = file_contents.keys().any(|fp| {
        let fname = fp.rsplit('/').next().unwrap_or(fp);
        matches!(fname, "poetry.lock" | "Pipfile.lock")
    });
    let has_go_sum = file_contents.keys().any(|fp| fp.ends_with("go.sum"));

    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<PyObject> = Vec::new();

    for (filepath, content) in &file_contents {
        let fname = filepath.rsplit('/').next().unwrap_or(filepath);
        let deps: Vec<(String, String, String)> = match fname {
            "requirements.txt" if !has_py_lock => parse_requirements_txt(content),
            "poetry.lock" => parse_poetry_lock(content),
            "Pipfile.lock" => parse_pipfile_lock(content),
            "package-lock.json" => parse_package_lock(content),
            "yarn.lock" => parse_yarn_lock(content),
            "pnpm-lock.yaml" => parse_pnpm_lock(content),
            "package.json" if !has_npm_lock => parse_package_json(content),
            "Cargo.lock" => parse_cargo_lock(content),
            "go.sum" => parse_go_sum(content),
            "go.mod" if !has_go_sum => parse_go_mod(content),
            "Gemfile.lock" => parse_gemfile_lock(content),
            "composer.lock" => parse_composer_lock(content),
            _ => continue,
        };
        for (name, version, ecosystem) in deps {
            let key = (name.to_lowercase(), version.clone(), ecosystem.clone());
            if seen.insert(key) {
                let d = PyDict::new(py);
                d.set_item("name", &name).ok();
                d.set_item("version", &version).ok();
                d.set_item("ecosystem", &ecosystem).ok();
                result.push(d.into());
                if result.len() >= 100 {
                    return result;
                }
            }
        }
    }
    result
}

fn parse_requirements_txt(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r"^([A-Za-z0-9_\-\.]+)\s*(?:==|>=|~=|<=)\s*([0-9][^\s;,]*)").unwrap();
    let mut deps = Vec::new();
    for line in content.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if let Some(cap) = re.captures(line) {
            let ver = cap.get(2).unwrap().as_str().split(',').next().unwrap_or("").trim().to_string();
            deps.push((cap[1].to_string(), ver, "PyPI".to_string()));
        }
    }
    deps
}

fn parse_package_lock(content: &str) -> Vec<(String, String, String)> {
    let data: serde_json::Value = serde_json::from_str(content).unwrap_or(serde_json::Value::Null);
    let empty_map = serde_json::Map::new();
    let packages = data.get("packages").and_then(|v| v.as_object()).unwrap_or(&empty_map);
    let re = Regex::new(r"^node_modules/").unwrap();
    let mut deps = Vec::new();
    for (pkg, info) in packages {
        if pkg.is_empty() { continue; }
        let name = re.replace(pkg, "").to_string();
        if let Some(ver) = info.get("version").and_then(|v| v.as_str()) {
            if !ver.is_empty() {
                deps.push((name, ver.to_string(), "npm".to_string()));
                if deps.len() >= 120 { break; }
            }
        }
    }
    deps
}

fn parse_package_json(content: &str) -> Vec<(String, String, String)> {
    let data: serde_json::Value = serde_json::from_str(content).unwrap_or(serde_json::Value::Null);
    let re_strip = Regex::new(r"^[^\d]*").unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    for section in &["dependencies", "devDependencies"] {
        if let Some(map) = data.get(*section).and_then(|v| v.as_object()) {
            for (name, ver_val) in map {
                let raw = ver_val.as_str().unwrap_or("");
                let v = re_strip.replace(raw, "").to_string();
                if !v.is_empty() && re_digit.is_match(&v) {
                    deps.push((name.clone(), v, "npm".to_string()));
                }
            }
        }
    }
    deps
}

fn parse_cargo_lock(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r#""([^"]+)""#).unwrap();
    let mut deps = Vec::new();
    let mut name: Option<String> = None;
    for line in content.lines() {
        if line.starts_with("name = ") {
            name = re.captures(line).map(|c| c[1].to_string());
        } else if line.starts_with("version = ") {
            if let (Some(n), Some(cap)) = (name.take(), re.captures(line)) {
                deps.push((n, cap[1].to_string(), "crates.io".to_string()));
            }
        }
    }
    deps
}

fn parse_go_sum(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 && parts[1].contains('/') {
            let mod_name = parts[0];
            let ver = parts[1].split('/').next().unwrap_or("").trim_start_matches('v');
            if !seen.contains(mod_name) && re.is_match(ver) {
                seen.insert(mod_name.to_string());
                deps.push((mod_name.to_string(), ver.to_string(), "Go".to_string()));
                if deps.len() >= 100 { break; }
            }
        }
    }
    deps
}

fn parse_go_mod(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut in_require = false;
    for line in content.lines() {
        let s = line.trim();
        if s.starts_with("require (") { in_require = true; continue; }
        if in_require && s == ")" { in_require = false; continue; }
        let target = if in_require { s } else { s.strip_prefix("require ").unwrap_or("") };
        if target.is_empty() { continue; }
        let parts: Vec<&str> = target.split_whitespace().collect();
        if parts.len() >= 2 {
            let m = parts[0];
            let v = parts[1].trim_start_matches('v');
            if !seen.contains(m) && re.is_match(v) {
                seen.insert(m.to_string());
                deps.push((m.to_string(), v.to_string(), "Go".to_string()));
                if deps.len() >= 100 { break; }
            }
        }
    }
    deps
}

fn parse_composer_lock(content: &str) -> Vec<(String, String, String)> {
    let data: serde_json::Value = serde_json::from_str(content).unwrap_or(serde_json::Value::Null);
    let re_strip = Regex::new(r"^v").unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    for section in &["packages", "packages-dev"] {
        if let Some(arr) = data.get(*section).and_then(|v| v.as_array()) {
            for entry in arr {
                let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let raw = entry.get("version").and_then(|v| v.as_str()).unwrap_or("");
                let ver = re_strip.replace(raw, "").to_string();
                if !name.is_empty() && !ver.is_empty() && re_digit.is_match(&ver) {
                    deps.push((name.to_string(), ver, "Packagist".to_string()));
                    if deps.len() >= 100 { break; }
                }
            }
        }
    }
    deps
}

fn parse_yarn_lock(content: &str) -> Vec<(String, String, String)> {
    let block_re = Regex::new(r"\n(?=\S)").unwrap();
    let name_re = Regex::new(r#"^"?(@?[^@"\s,]+)@"#).unwrap();
    let ver_re = Regex::new(r#"(?m)^\s+version "([^"]+)""#).unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for block in block_re.split(content) {
        let block = block.trim();
        if block.is_empty() || block.starts_with('#') { continue; }
        let n = name_re.captures(block);
        let v = ver_re.captures(block);
        if let (Some(nc), Some(vc)) = (n, v) {
            let name = nc[1].to_string();
            let version = vc[1].to_string();
            if !seen.contains(&(name.to_lowercase(), version.clone())) && re_digit.is_match(&version) {
                seen.insert((name.to_lowercase(), version.clone()));
                deps.push((name, version, "npm".to_string()));
                if deps.len() >= 150 { break; }
            }
        }
    }
    deps
}

fn parse_pnpm_lock(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r#"(?m)^\s+/?(@?[^@\s/]+)@(\d[^/:"\s]*)"#).unwrap();
    let mut deps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for cap in re.captures_iter(content) {
        let name = cap[1].to_string();
        let version = cap[2].trim().to_string();
        if !seen.contains(&(name.to_lowercase(), version.clone())) {
            seen.insert((name.to_lowercase(), version.clone()));
            deps.push((name, version, "npm".to_string()));
            if deps.len() >= 150 { break; }
        }
    }
    deps
}

fn parse_poetry_lock(content: &str) -> Vec<(String, String, String)> {
    let re_name = Regex::new(r#"name = "([^"]+)""#).unwrap();
    let re_ver = Regex::new(r#"version = "([^"]+)""#).unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    let mut name: Option<String> = None;
    for line in content.lines() {
        let s = line.trim();
        if s == "[[package]]" { name = None; continue; }
        if let Some(cap) = re_name.captures(s) { name = Some(cap[1].to_string()); }
        if let Some(cap) = re_ver.captures(s) {
            let ver = cap[1].to_string();
            if let Some(n) = name.take() {
                if re_digit.is_match(&ver) {
                    deps.push((n, ver, "PyPI".to_string()));
                }
            }
        }
    }
    deps
}

fn parse_pipfile_lock(content: &str) -> Vec<(String, String, String)> {
    let data: serde_json::Value = serde_json::from_str(content).unwrap_or(serde_json::Value::Null);
    let re_strip = Regex::new(r"^[=<>!^~*\s]+").unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    for section in &["default", "develop"] {
        if let Some(map) = data.get(*section).and_then(|v| v.as_object()) {
            for (name, info) in map {
                let raw = info.get("version").and_then(|v| v.as_str()).unwrap_or("");
                let ver = re_strip.replace(raw, "").to_string();
                if !ver.is_empty() && re_digit.is_match(&ver) {
                    deps.push((name.clone(), ver, "PyPI".to_string()));
                }
            }
        }
    }
    deps
}

fn parse_gemfile_lock(content: &str) -> Vec<(String, String, String)> {
    let re = Regex::new(r"^\s{4}([a-zA-Z0-9_\-]+)\s+\(([^\)]+)\)").unwrap();
    let re_digit = Regex::new(r"^\d").unwrap();
    let mut deps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut in_specs = false;
    for line in content.lines() {
        if line.trim() == "specs:" { in_specs = true; continue; }
        if in_specs && !line.is_empty() && !line.starts_with(' ') { in_specs = false; }
        if in_specs {
            if let Some(cap) = re.captures(line) {
                let name = cap[1].to_string();
                let version = cap[2].to_string();
                let key = (name.to_lowercase(), version.clone());
                if !seen.contains(&key) && re_digit.is_match(&version) {
                    seen.insert(key);
                    deps.push((name, version, "RubyGems".to_string()));
                    if deps.len() >= 100 { break; }
                }
            }
        }
    }
    deps
}
