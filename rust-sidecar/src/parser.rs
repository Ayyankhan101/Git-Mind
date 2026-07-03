use crate::models::*;
use solang_parser::pt::*;

/// Calculate 1-based line number from a byte offset in source text.
fn line_from_offset(source: &str, offset: usize) -> u32 {
    let pos = offset.min(source.len());
    source[..pos].matches('\n').count() as u32 + 1
}

/// Extract visibility name from FunctionAttribute list.
fn get_fn_visibility(attrs: &[FunctionAttribute]) -> String {
    for attr in attrs {
        if let FunctionAttribute::Visibility(v) = attr {
            return format!("{:?}", v);
        }
    }
    "internal".to_string()
}

/// Extract visibility name from VariableAttribute list.
fn get_var_visibility(attrs: &[VariableAttribute]) -> String {
    for attr in attrs {
        if let VariableAttribute::Visibility(v) = attr {
            return format!("{:?}", v);
        }
    }
    "internal".to_string()
}

/// Extract modifier names from FunctionAttribute list.
fn get_fn_modifiers(attrs: &[FunctionAttribute]) -> Vec<String> {
    attrs
        .iter()
        .filter_map(|attr| {
            if let FunctionAttribute::BaseOrModifier(_, base) = attr {
                Some(format!("{:?}", base))
            } else {
                None
            }
        })
        .collect()
}

/// Extract parameter names from a ParameterList.
fn param_names(params: &[(Loc, Option<Parameter>)]) -> Vec<String> {
    params
        .iter()
        .filter_map(|(_, p)| {
            p.as_ref()
                .and_then(|p| p.name.as_ref().map(|n| n.name.clone()))
        })
        .collect()
}

pub fn parse_solidity(source: &str) -> ParseResponse {
    let (doc, _comments) = match solang_parser::parse(source, 0) {
        Ok(d) => d,
        Err(diagnostics) => {
            let msg = diagnostics
                .iter()
                .map(|d| d.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            return ParseResponse {
                contracts: vec![],
                error: Some(format!("Parse error: {}", msg)),
            };
        }
    };

    let contracts: Vec<ContractInfo> = doc
        .0
        .into_iter()
        .filter_map(|unit| match unit {
            SourceUnitPart::ContractDefinition(cd) => Some(extract_contract(source, *cd)),
            _ => None,
        })
        .collect();

    ParseResponse {
        contracts,
        error: None,
    }
}

fn extract_contract(source: &str, cd: ContractDefinition) -> ContractInfo {
    let name = cd.name.as_ref().map(|n| n.name.clone()).unwrap_or_default();

    let mut functions = Vec::new();
    let mut state_variables = Vec::new();
    let mut modifiers = Vec::new();
    let mut events = Vec::new();

    for part in cd.parts {
        match part {
            ContractPart::FunctionDefinition(fd) => {
                let is_modifier = matches!(fd.ty, FunctionTy::Modifier);
                let info = FunctionInfo {
                    name: fd.name.as_ref().map(|n| n.name.clone()).unwrap_or_default(),
                    visibility: get_fn_visibility(&fd.attributes),
                    params: param_names(&fd.params),
                    returns: param_names(&fd.returns),
                    modifiers: get_fn_modifiers(&fd.attributes),
                    line: line_from_offset(source, fd.loc.start()),
                };
                if is_modifier {
                    modifiers.push(ModifierInfo {
                        name: info.name.clone(),
                        line: info.line,
                    });
                } else {
                    functions.push(info);
                }
            }
            ContractPart::VariableDefinition(vd) => {
                state_variables.push(VariableInfo {
                    name: vd.name.as_ref().map(|n| n.name.clone()).unwrap_or_default(),
                    typ: format!("{:?}", vd.ty),
                    visibility: get_var_visibility(&vd.attrs),
                    is_constant: vd
                        .attrs
                        .iter()
                        .any(|a| matches!(a, VariableAttribute::Constant(_))),
                    is_immutable: vd
                        .attrs
                        .iter()
                        .any(|a| matches!(a, VariableAttribute::Immutable(_))),
                    line: line_from_offset(source, vd.loc.start()),
                });
            }
            ContractPart::EventDefinition(ed) => {
                events.push(EventInfo {
                    name: ed.name.as_ref().map(|n| n.name.clone()).unwrap_or_default(),
                    params: ed
                        .fields
                        .iter()
                        .map(|f| {
                            let pname = f.name.as_ref().map(|n| n.name.clone()).unwrap_or_default();
                            let pty = format!("{:?}", f.ty);
                            (pname, pty)
                        })
                        .collect(),
                    line: line_from_offset(source, ed.loc.start()),
                });
            }
            _ => {}
        }
    }

    ContractInfo {
        name,
        functions,
        state_variables,
        modifiers,
        events,
    }
}
