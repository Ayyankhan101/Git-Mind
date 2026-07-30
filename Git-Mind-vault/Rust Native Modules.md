---
title: "Rust Native Acceleration"
tags: [gitmind, rust, architecture, native]
---

# Rust Native Modules

Git-Mind uses PyO3 Rust modules for performance-critical paths.

- `rust_gitmind_src_blame` — blame.rs
- `rust_gitmind_src_blame_batch_blame` — batch_blame()
- `rust_gitmind_src_blame_rs_python` — Python
- `rust_gitmind_src_blame_rs_vec` — Vec
- `rust_gitmind_src_blame_rs_string` — String
- `rust_gitmind_src_blame_rs_pyobject` — PyObject
- `rust_gitmind_src_blame_parse_porcelain_batch` — parse_porcelain_batch()
- `rust_gitmind_src_blame_rs_hashmap` — HashMap
- `rust_gitmind_src_dep_parsers` — dep_parsers.rs
- `rust_gitmind_src_dep_parsers_parse_dependencies` — parse_dependencies()
- `rust_gitmind_src_dep_parsers_rs_python` — Python
- `rust_gitmind_src_dep_parsers_rs_hashmap` — HashMap
- `rust_gitmind_src_dep_parsers_rs_string` — String
- `rust_gitmind_src_dep_parsers_rs_vec` — Vec
- `rust_gitmind_src_dep_parsers_rs_pyobject` — PyObject
- `rust_gitmind_src_dep_parsers_parse_requirements_txt` — parse_requirements_txt()
- `rust_gitmind_src_dep_parsers_parse_package_lock` — parse_package_lock()
- `rust_gitmind_src_dep_parsers_parse_package_json` — parse_package_json()
- `rust_gitmind_src_dep_parsers_parse_cargo_lock` — parse_cargo_lock()
- `rust_gitmind_src_dep_parsers_parse_go_sum` — parse_go_sum()
- `rust_gitmind_src_dep_parsers_parse_go_mod` — parse_go_mod()
- `rust_gitmind_src_dep_parsers_parse_composer_lock` — parse_composer_lock()
- `rust_gitmind_src_dep_parsers_parse_yarn_lock` — parse_yarn_lock()
- `rust_gitmind_src_dep_parsers_parse_pnpm_lock` — parse_pnpm_lock()
- `rust_gitmind_src_dep_parsers_parse_poetry_lock` — parse_poetry_lock()
- `rust_gitmind_src_dep_parsers_parse_pipfile_lock` — parse_pipfile_lock()
- `rust_gitmind_src_dep_parsers_parse_gemfile_lock` — parse_gemfile_lock()
- `rust_gitmind_src_file_scanner` — file_scanner.rs
- `rust_gitmind_src_file_scanner_scan_secrets` — scan_secrets()
- `rust_gitmind_src_file_scanner_rs_python` — Python
- `rust_gitmind_src_file_scanner_rs_hashmap` — HashMap
- `rust_gitmind_src_file_scanner_rs_string` — String
- `rust_gitmind_src_file_scanner_rs_vec` — Vec
- `rust_gitmind_src_file_scanner_rs_pyobject` — PyObject
- `rust_gitmind_src_file_scanner_scan_sensitive_files` — scan_sensitive_files()
- `rust_gitmind_src_file_scanner_scan_route_files` — scan_route_files()
- `rust_gitmind_src_file_scanner_compute_docs_score` — compute_docs_score()
- `rust_gitmind_src_lib` — lib.rs
- `rust_gitmind_src_lib_gitmind_core` — gitmind_core()
- `rust_gitmind_src_text_splitter` — text_splitter.rs
- `rust_gitmind_src_text_splitter_split_text` — split_text()
- `rust_gitmind_src_text_splitter_rs_vec` — Vec
- `rust_gitmind_src_text_splitter_rs_string` — String
- `rust_gitmind_src_text_splitter_split_recursive` — split_recursive()
- `rust_gitmind_src_text_splitter_find_best_separator` — find_best_separator()
- `rust_gitmind_src_text_splitter_find_remaining_separators` — find_remaining_separators()
- `rust_gitmind_src_text_splitter_extract_overlap` — extract_overlap()
- `rust_gitmind_src_text_splitter_split_files` — split_files()
- `rust_gitmind_src_text_splitter_rs_hashmap` — HashMap
- `rust_sidecar_src_main` — main.rs
- `rust_sidecar_src_main_parserequest` — ParseRequest
- `rust_sidecar_src_main_rs_string` — String
- `rust_sidecar_src_main_parse_handler` — parse_handler()
- `rust_sidecar_src_main_health_handler` — health_handler()
- `rust_sidecar_src_main_main` — main()
- `rust_sidecar_src_models` — models.rs
- `rust_sidecar_src_models_parseresponse` — ParseResponse
- `rust_sidecar_src_models_rs_vec` — Vec
- `rust_sidecar_src_models_rs_option` — Option
- `rust_sidecar_src_models_rs_string` — String
- `rust_sidecar_src_models_contractinfo` — ContractInfo
- `rust_sidecar_src_models_functioninfo` — FunctionInfo
- `rust_sidecar_src_models_variableinfo` — VariableInfo
- `rust_sidecar_src_models_modifierinfo` — ModifierInfo
- `rust_sidecar_src_models_eventinfo` — EventInfo
- `rust_sidecar_src_parser` — parser.rs
- `rust_sidecar_src_parser_line_from_offset` — line_from_offset()
- `rust_sidecar_src_parser_get_fn_visibility` — get_fn_visibility()
- `rust_sidecar_src_parser_rs_string` — String
- `rust_sidecar_src_parser_get_var_visibility` — get_var_visibility()
- `rust_sidecar_src_parser_get_fn_modifiers` — get_fn_modifiers()
- `rust_sidecar_src_parser_rs_vec` — Vec
- `rust_sidecar_src_parser_param_names` — param_names()
- `rust_sidecar_src_parser_rs_option` — Option
- `rust_sidecar_src_parser_parse_solidity` — parse_solidity()
- `rust_sidecar_src_parser_extract_contract` — extract_contract()
- `concept_rust_native_acceleration` — Rust Native Acceleration
- `rust_gitmind_pyproject_toml` — gitmind-core project config
- `rust_gitmind_src_lib_rs` — gitmind_core PyO3 module entry
- `rust_gitmind_src_blame_rs` — batch_blame — git blame porcelain parser
- `rust_gitmind_src_dep_parsers_rs` — parse_dependencies — multi-ecosystem lockfile parser
- `rust_gitmind_src_file_scanner_rs` — file_scanner — secrets/sensitive-file/route scanner
- `rust_gitmind_src_text_splitter_rs` — split_text/split_files — recursive text chunker
- `rust_sidecar_src_main_rs` — rust-sidecar Axum HTTP server
- `rust_sidecar_src_models_rs` — Solidity parser data models (ParseResponse, ContractInfo, etc.)
- `rust_sidecar_src_parser_rs` — parse_solidity — solang-based Solidity AST extractor

---

Part of [[Git-Mind Graph]]
