use serde::Serialize;

#[derive(Serialize)]
pub struct ParseResponse {
    pub contracts: Vec<ContractInfo>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct ContractInfo {
    pub name: String,
    pub functions: Vec<FunctionInfo>,
    pub state_variables: Vec<VariableInfo>,
    pub modifiers: Vec<ModifierInfo>,
    pub events: Vec<EventInfo>,
}

#[derive(Serialize)]
pub struct FunctionInfo {
    pub name: String,
    pub visibility: String,
    pub params: Vec<String>,
    pub returns: Vec<String>,
    pub modifiers: Vec<String>,
    pub line: u32,
}

#[derive(Serialize)]
pub struct VariableInfo {
    pub name: String,
    pub typ: String,
    pub visibility: String,
    pub is_constant: bool,
    pub is_immutable: bool,
    pub line: u32,
}

#[derive(Serialize)]
pub struct ModifierInfo {
    pub name: String,
    pub line: u32,
}

#[derive(Serialize)]
pub struct EventInfo {
    pub name: String,
    pub params: Vec<(String, String)>,
    pub line: u32,
}
