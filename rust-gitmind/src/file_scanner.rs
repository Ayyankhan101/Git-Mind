use pyo3::prelude::*;
use pyo3::types::PyDict;
use regex::Regex;
use regex::RegexSet;

// ── Secret scanning ──────────────────────────────────────────────────────

const SECRET_PATTERNS: &[(&str, &str)] = &[
    (r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY", "Private key"),
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID"),
    (r#"(?i)(?:password|passwd|pwd)\s*=\s*["\'][^"\']{6,}["\']"#, "Hardcoded password"),
    (r#"(?i)(?:api[_-]?key|apikey)\s*=\s*["\'][^"\']{8,}["\']"#, "Hardcoded API key"),
    (r#"(?i)(?:secret|token)\s*=\s*["\'][^"\']{8,}["\']"#, "Hardcoded secret/token"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub Personal Access Token"),
    (r"gsk_[a-zA-Z0-9_]{48}", "Groq API Key"),
    (r"sk-[a-zA-Z0-9]{48}", "OpenAI API Key"),
    (r"(?i)mongodb(?:\+srv)?://[^@\s]+@", "MongoDB connection string with credentials"),
    (r"(?i)postgres(?:ql)?://[^@\s]+:[^@\s]+@", "PostgreSQL connection string with credentials"),
];

const SKIP_PATH_RE: &str = r"(?i)(test|spec|mock|fixture|example|sample|\.example|placeholder)";

const CRITICAL_KEYWORDS: &[&str] = &["Private key", "AWS", "Token", "OpenAI", "Groq"];

// ── Sensitive file scanning ──────────────────────────────────────────────

const SENSITIVE_FILE_RE: &str = r"(?i)(^|/)(\.env(\.|$)|credentials?\.json|secrets?\.(yaml|yml|json|toml)|.*\.pem$|.*\.key$|.*\.p12$|.*\.pfx$|id_rsa|id_dsa|id_ecdsa|id_ed25519|\.netrc$|\.aws/credentials|service.?account.*\.json|.*\.keystore$)";

// ── Route pattern detection ──────────────────────────────────────────────

const ROUTE_PATTERNS: &[&str] = &[
    r"@app\.(get|post|put|delete|patch)\s*\(",
    r"@router\.(get|post|put|delete|patch)\s*\(",
    r"router\.(get|post|put|delete|patch)\s*\(",
    r"app\.(get|post|put|delete|patch)\s*\(",
    r"@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(",
    r"@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(",
    r"path\s*\(",
    r"url\s*\(",
    r"resources?\s+:[a-z_]+",
    r#"(get|post|put|delete|patch)\s+["\'][/:]"#,
    r"r\.(GET|POST|PUT|DELETE|PATCH)\s*\(",
    r"e\.(GET|POST|PUT|DELETE|PATCH)\s*\(",
    r"mux\.(HandleFunc|Handle)\s*\(",
];

// ── Comment ratio ────────────────────────────────────────────────────────

const COMMENT_RE: &str = r#"^\s*(#|//|/\*|\*|""")"#;
const CODE_EXTS: &[&str] = &[".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php"];

// ── Public API ───────────────────────────────────────────────────────────

#[pyfunction]
pub fn scan_secrets(py: Python<'_>, file_contents: std::collections::HashMap<String, String>) -> Vec<PyObject> {
    let skip_re = Regex::new(SKIP_PATH_RE).unwrap();
    let set = RegexSet::new(SECRET_PATTERNS.iter().map(|(r, _)| r)).unwrap();
    let regexes: Vec<Regex> = set.patterns().iter()
        .map(|p| Regex::new(p).unwrap())
        .collect();
    let mut results = Vec::new();

    for (path, content) in &file_contents {
        if skip_re.is_match(path) { continue; }
        for (idx, re) in regexes.iter().enumerate() {
            if let Some(m) = re.find(content) {
                let line_no = content[..m.start()].matches('\n').count() as u32 + 1;
                let label = SECRET_PATTERNS[idx].1;
                let sev = if CRITICAL_KEYWORDS.iter().any(|k| label.contains(k)) {
                    "critical"
                } else {
                    "high"
                };
                let d = PyDict::new(py);
                d.set_item("path", path).ok();
                d.set_item("line", line_no).ok();
                d.set_item("type", label).ok();
                let snippet = &m.as_str()[..m.as_str().len().min(80)];
                d.set_item("snippet", snippet).ok();
                d.set_item("severity", sev).ok();
                results.push(d.into());
            }
        }
    }
    results
}

#[pyfunction]
pub fn scan_sensitive_files(py: Python<'_>, file_tree: Vec<String>) -> Vec<PyObject> {
    let re = Regex::new(SENSITIVE_FILE_RE).unwrap();
    let mut results = Vec::new();
    for path in &file_tree {
        if re.is_match(path) {
            let d = PyDict::new(py);
            d.set_item("path", path).ok();
            d.set_item("reason", "Sensitive filename tracked in git").ok();
            results.push(d.into());
        }
    }
    results
}

#[pyfunction]
pub fn scan_route_files(file_contents: std::collections::HashMap<String, String>) -> Vec<String> {
    let set = RegexSet::new(ROUTE_PATTERNS).unwrap();
    let mut results = Vec::new();
    for (path, content) in &file_contents {
        if set.is_match(content) {
            results.push(path.clone());
        }
    }
    results
}

#[pyfunction]
pub fn compute_docs_score(file_contents: std::collections::HashMap<String, String>) -> f64 {
    let comment_re = Regex::new(COMMENT_RE).unwrap();
    let mut total_lines = 0usize;
    let mut comment_lines = 0usize;
    for (path, content) in &file_contents {
        let ext = path.rsplit('.').next().map(|e| format!(".{}", e)).unwrap_or_default();
        if !CODE_EXTS.contains(&ext.as_str()) { continue; }
        for line in content.lines() {
            total_lines += 1;
            if comment_re.is_match(line) {
                comment_lines += 1;
            }
        }
    }
    if total_lines == 0 { return 50.0; }
    let ratio = comment_lines as f64 / total_lines as f64;
    (ratio * 1000.0).min(100.0)
}
