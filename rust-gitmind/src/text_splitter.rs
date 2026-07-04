use pyo3::prelude::*;

/// Recursive text splitter matching LangChain's RecursiveCharacterTextSplitter.
#[pyfunction]
pub fn split_text(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    separators: Vec<String>,
) -> Vec<String> {
    if text.is_empty() || chunk_size == 0 {
        return vec![];
    }
    let mut result = Vec::new();
    split_recursive(text, chunk_size, chunk_overlap, &separators, &mut result);
    result
}

fn split_recursive(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    separators: &[String],
    result: &mut Vec<String>,
) {
    if text.len() <= chunk_size {
        let trimmed = text.trim().to_string();
        if !trimmed.is_empty() {
            result.push(trimmed);
        }
        return;
    }

    let separator = find_best_separator(text, separators);

    if separator.is_empty() {
        let mut start = 0;
        while start < text.len() {
            let end = (start + chunk_size).min(text.len());
            let piece = text[start..end].trim().to_string();
            if !piece.is_empty() {
                result.push(piece);
            }
            if end >= text.len() {
                break;
            }
            start = end.saturating_sub(chunk_overlap);
        }
        return;
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    let sep: &str = separator;
    for piece in text.split(sep) {
        let piece = piece.trim();
        if piece.is_empty() {
            continue;
        }

        // Compute what the merged chunk would look like
        let merged_len = if current.is_empty() {
            piece.len()
        } else {
            current.len() + separator.len() + piece.len()
        };

        if merged_len > chunk_size && !current.is_empty() {
            // Flush current chunk, start new one
            chunks.push(current.trim().to_string());
            if piece.len() > chunk_size {
                let remaining = find_remaining_separators(separators, separator);
                split_recursive(piece, chunk_size, chunk_overlap, remaining, result);
                current.clear();
            } else {
                current = piece.to_string();
            }
        } else if piece.len() > chunk_size {
            if !current.is_empty() {
                chunks.push(current.trim().to_string());
                current.clear();
            }
            let remaining = find_remaining_separators(separators, separator);
            split_recursive(piece, chunk_size, chunk_overlap, remaining, result);
        } else if current.is_empty() {
            current = piece.to_string();
        } else {
            current.push_str(separator);
            current.push_str(piece);
        }
    }

    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        chunks.push(trimmed);
    }

    // Apply overlap between chunks
    if chunk_overlap == 0 || chunks.len() <= 1 {
        result.extend(chunks);
    } else {
        for (i, chunk) in chunks.iter().enumerate() {
            if i == 0 {
                result.push(chunk.clone());
            } else {
                let overlap = extract_overlap(result.last().unwrap(), chunk_overlap);
                if overlap.is_empty() {
                    result.push(chunk.clone());
                } else {
                    result.push(format!("{}{}", overlap, chunk));
                }
            }
        }
    }
}

fn find_best_separator<'a>(text: &str, separators: &'a [String]) -> &'a str {
    for sep in separators {
        if !sep.is_empty() && text.contains(sep.as_str()) {
            return sep;
        }
    }
    ""
}

fn find_remaining_separators<'a>(separators: &'a [String], current: &str) -> &'a [String] {
    if let Some(idx) = separators.iter().position(|s| s == current) {
        &separators[idx + 1..]
    } else {
        &[]
    }
}

fn extract_overlap(text: &str, max_chars: usize) -> String {
    if max_chars == 0 || text.len() <= max_chars {
        return text.trim().to_string();
    }
    let start = text.len() - max_chars;
    let slice = &text[start..];
    if let Some(pos) = slice.find(|c: char| c.is_whitespace()) {
        let s = &slice[pos + 1..];
        let trimmed = s.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    slice.trim().to_string()
}

#[pyfunction]
pub fn split_files(
    file_contents: std::collections::HashMap<String, String>,
    chunk_size: usize,
    chunk_overlap: usize,
    separators: Vec<String>,
) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut docs = Vec::new();
    let mut metas = Vec::new();
    let mut ids = Vec::new();

    for (filepath, content) in &file_contents {
        let chunks = split_text(content, chunk_size, chunk_overlap, separators.clone());
        for (i, chunk) in chunks.iter().enumerate() {
            metas.push(format!(
                r#"{{"filepath":"{}","chunk_index":{}}}"#,
                filepath, i
            ));
            ids.push(format!("{}::{}", filepath, i));
            docs.push(chunk.clone());
        }
    }

    (docs, metas, ids)
}
