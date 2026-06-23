use crate::models::*;

pub fn parse_solidity(source: &str) -> ParseResponse {
    let (doc, _comments) = match solang_parser::parse(source, 0) {
        Ok(d) => d,
        Err(e) => return ParseResponse {
            contracts: vec![],
            error: Some(format!("Parse error: {}", e)),
        },
    };

    let contracts: Vec<ContractInfo> = doc.0.into_iter()
        .filter_map(|unit| match unit {
            solang_parser::pt::SourceUnitPart::ContractDefinition(cd) => {
                Some(extract_contract(cd))
            }
            _ => None,
        })
        .collect();

    ParseResponse { contracts, error: None }
}

fn extract_contract(cd: solang_parser::pt::ContractDefinition) -> ContractInfo {
    let name = format!("{:?}", cd.name);
    let kind = cd.kind; // ContractTy::{Contract, Interface, Library}

    let mut functions = Vec::new();
    let mut state_variables = Vec::new();
    let mut modifiers = Vec::new();
    let mut events = Vec::new();

    for part in cd.parts {
        match part {
            solang_parser::pt::ContractPart::FunctionDefinition(fd) => {
                functions.push(FunctionInfo {
                    name: format!("{:?}", fd.name),
                    visibility: format!("{:?}", fd.visibility),
                    params: vec![],
                    returns: vec![],
                    modifiers: vec![],
                    line: fd.loc.ln(),
                });
            }
            solang_parser::pt::ContractPart::VariableDefinition(vd) => {
                state_variables.push(VariableInfo {
                    name: format!("{:?}", vd.name),
                    typ: format!("{:?}", vd.ty),
                    visibility: format!("{:?}", vd.visibility),
                    is_constant: vd.is_constant,
                    is_immutable: false,
                    line: vd.loc.ln(),
                });
            }
            solang_parser::pt::ContractPart::ModifierDefinition(md) => {
                modifiers.push(ModifierInfo {
                    name: format!("{:?}", md.name),
                    line: md.loc.ln(),
                });
            }
            solang_parser::pt::ContractPart::EventDefinition(ed) => {
                events.push(EventInfo {
                    name: format!("{:?}", ed.name),
                    params: vec![],
                    line: ed.loc.ln(),
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
