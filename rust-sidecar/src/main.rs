mod models;
mod parser;

use axum::http::Method;
use axum::response::Json;
use axum::{routing::post, Router};
use serde::Deserialize;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[derive(Deserialize)]
struct ParseRequest {
    source: String,
}

async fn parse_handler(Json(req): Json<ParseRequest>) -> Json<models::ParseResponse> {
    let result = parser::parse_solidity(&req.source);
    Json(result)
}

async fn health_handler() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/parse", post(parse_handler))
        .route("/health", axum::routing::get(health_handler))
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8003));
    tracing::info!("Solidity parser listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
