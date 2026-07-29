use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let address: SocketAddr = std::env::var("KORRID_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1:43117".into())
        .parse()
        .expect("valid KORRID_ADDRESS");
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind korrid spike server");
    let capability = std::env::var("KORRID_RPC_CAPABILITY")
        .expect("KORRID_RPC_CAPABILITY must be set for the standalone server");
    let allowed_origin = std::env::var("KORRID_PORTAL_ORIGIN")
        .unwrap_or_else(|_| "https://appassets.androidplatform.net".into());
    println!("korrid listening on http://{address}/rpc");
    axum::serve(
        listener,
        korrid::router_with_capability(&capability, &allowed_origin),
    )
    .await
    .expect("serve korrid spike");
}
