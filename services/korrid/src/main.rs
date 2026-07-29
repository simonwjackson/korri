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
    println!("korrid listening on http://{address}/rpc");
    axum::serve(listener, korrid::router())
        .await
        .expect("serve korrid spike");
}
