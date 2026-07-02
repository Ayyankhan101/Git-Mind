mod dep_parsers;
mod file_scanner;

use pyo3::prelude::*;

#[pymodule]
fn gitmind_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(dep_parsers::parse_dependencies, m)?)?;
    m.add_function(wrap_pyfunction!(file_scanner::scan_secrets, m)?)?;
    m.add_function(wrap_pyfunction!(file_scanner::scan_sensitive_files, m)?)?;
    m.add_function(wrap_pyfunction!(file_scanner::scan_route_files, m)?)?;
    m.add_function(wrap_pyfunction!(file_scanner::compute_docs_score, m)?)?;
    Ok(())
}
