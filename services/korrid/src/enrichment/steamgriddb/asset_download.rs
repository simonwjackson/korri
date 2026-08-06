use reqwest::{blocking::Client, redirect::Policy, Url};
use std::{
    collections::BTreeSet,
    io::Read,
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    time::Duration,
};

#[cfg(test)]
use super::AssetDownloadPolicy;
use super::EnrichmentDiagnostic;

pub(super) fn download_image(url: &Url, max_bytes: u64) -> Result<Vec<u8>, EnrichmentDiagnostic> {
    download_image_checked(url, max_bytes, &resolve_public_address, false)
}

#[cfg(test)]
pub(super) fn download_image_with_policy(
    url: &Url,
    max_bytes: u64,
    policy: &AssetDownloadPolicy,
) -> Result<Vec<u8>, EnrichmentDiagnostic> {
    download_image_checked(
        url,
        max_bytes,
        &*policy.resolver,
        policy.allow_http_loopback,
    )
}

fn download_image_checked(
    url: &Url,
    max_bytes: u64,
    resolver: &(dyn Fn(&str, u16) -> Result<SocketAddr, EnrichmentDiagnostic> + Send + Sync),
    allow_http_loopback: bool,
) -> Result<Vec<u8>, EnrichmentDiagnostic> {
    if url.scheme() != "https" {
        if !(allow_http_loopback
            && url.scheme() == "http"
            && url
                .host_str()
                .is_some_and(|host| host == "127.0.0.1" || host == "localhost" || host == "::1"))
        {
            return Err(EnrichmentDiagnostic {
                code: "AssetUrlRejected",
                message: "SteamGridDB asset URL must use HTTPS".into(),
                playable_id: None,
            });
        }
    }
    let host = url.host_str().ok_or_else(|| EnrichmentDiagnostic {
        code: "AssetUrlRejected",
        message: "SteamGridDB asset URL has no host".into(),
        playable_id: None,
    })?;
    let approved = resolver(host, url.port_or_known_default().unwrap_or(443))?;
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(10))
        .resolve(host, approved)
        .build()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download client could not be created".into(),
            playable_id: None,
        })?;
    let mut response = client
        .get(url.clone())
        .send()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download failed".into(),
            playable_id: None,
        })?;
    if response.status().is_redirection() {
        return Err(EnrichmentDiagnostic {
            code: "AssetRedirectRejected",
            message: "SteamGridDB asset redirects are not followed".into(),
            playable_id: None,
        });
    }
    if !response.status().is_success() {
        return Err(EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download failed".into(),
            playable_id: None,
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes)
    {
        return Err(EnrichmentDiagnostic {
            code: "AssetTooLarge",
            message: "asset bytes exceed the configured limit".into(),
            playable_id: None,
        });
    }
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let read = response
            .read(&mut chunk)
            .map_err(|_| EnrichmentDiagnostic {
                code: "AssetDownloadFailed",
                message: "asset download failed".into(),
                playable_id: None,
            })?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..read]);
        if bytes.len() as u64 > max_bytes {
            return Err(EnrichmentDiagnostic {
                code: "AssetTooLarge",
                message: "asset bytes exceed the configured limit".into(),
                playable_id: None,
            });
        }
    }
    Ok(bytes)
}

pub(super) fn resolve_public_address(
    host: &str,
    port: u16,
) -> Result<SocketAddr, EnrichmentDiagnostic> {
    let mut seen = BTreeSet::new();
    let addrs = (host, port)
        .to_socket_addrs()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetUrlRejected",
            message: "asset host could not be resolved".into(),
            playable_id: None,
        })?;
    for addr in addrs {
        if seen.insert(addr.ip()) && is_public_ip(addr.ip()) {
            return Ok(addr);
        }
    }
    Err(EnrichmentDiagnostic {
        code: "AssetUrlRejected",
        message: "asset host resolved to a private address".into(),
        playable_id: None,
    })
}

pub(super) fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_global_ipv4(ip),
        IpAddr::V6(ip) => {
            if let Some(embedded) = embedded_ipv4(ip) {
                return is_global_ipv4(embedded);
            }
            is_global_ipv6(ip)
        }
    }
}

fn embedded_ipv4(ip: std::net::Ipv6Addr) -> Option<std::net::Ipv4Addr> {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return Some(mapped);
    }
    let segments = ip.segments();
    if segments[..6].iter().all(|segment| *segment == 0) && (segments[6] != 0 || segments[7] != 1) {
        let octets = ip.octets();
        return Some(std::net::Ipv4Addr::new(
            octets[12], octets[13], octets[14], octets[15],
        ));
    }
    if segments[..6] == [0x0064, 0xff9b, 0, 0, 0, 0] || segments[..3] == [0x0064, 0xff9b, 0x0001] {
        let octets = ip.octets();
        return Some(std::net::Ipv4Addr::new(
            octets[12], octets[13], octets[14], octets[15],
        ));
    }
    if segments[0] == 0x2002 {
        let octets = ip.octets();
        return Some(std::net::Ipv4Addr::new(
            octets[2], octets[3], octets[4], octets[5],
        ));
    }
    None
}

fn is_global_ipv6(ip: std::net::Ipv6Addr) -> bool {
    let segments = ip.segments();
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        || (segments[0] == 0x2001 && segments[1] == 0x0000))
}

fn is_global_ipv4(ip: std::net::Ipv4Addr) -> bool {
    let octets = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || octets[0] == 0
        || octets[0] >= 240
        || (octets[0] == 100 && (octets[1] & 0b1100_0000) == 0b0100_0000)
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
        || (octets[0] == 198 && (octets[1] == 18 || octets[1] == 19))
        || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
        || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113))
}
