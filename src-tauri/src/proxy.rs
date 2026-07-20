use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Method, Url};
use serde::Serialize;
use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Duration;

/// Renderer fetches to CLIProxyAPI hit CORS / mixed-content walls, so the Rust
/// side proxies them — but ONLY to loopback or private-LAN addresses. Public
/// hosts are rejected outright; this must never become an open relay.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
pub async fn proxy_http(
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<ProxyResponse, String> {
    let parsed = Url::parse(&url).map_err(|error| format!("invalid url: {error}"))?;
    ensure_private_target(&parsed)?;

    let method = Method::from_bytes(method.to_ascii_uppercase().as_bytes())
        .map_err(|_| format!("invalid method: {method}"))?;

    let mut header_map = HeaderMap::new();
    for (name, value) in headers.unwrap_or_default() {
        // Hop-by-hop / connection-control headers are the client's business.
        if name.eq_ignore_ascii_case("host")
            || name.eq_ignore_ascii_case("content-length")
            || name.eq_ignore_ascii_case("connection")
            || name.eq_ignore_ascii_case("transfer-encoding")
        {
            continue;
        }
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("invalid header name: {name}"))?;
        let header_value = HeaderValue::from_str(&value)
            .map_err(|_| format!("invalid header value for {name}"))?;
        header_map.insert(header_name, header_value);
    }

    // No redirects: a private host answering 302 to a public URL must not
    // widen the allowlist.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let mut request = client.request(method, parsed).headers(header_map);
    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status().as_u16();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(format!(
            "response too large: {} bytes (limit {MAX_RESPONSE_BYTES})",
            bytes.len()
        ));
    }

    Ok(ProxyResponse {
        status,
        body: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

/// Only http, and only to hosts that cannot be public: `localhost`, loopback,
/// RFC1918 / link-local IPv4, or loopback / unique-local / link-local IPv6.
/// Non-localhost DNS names are rejected entirely — resolving them first would
/// still be open to rebinding between check and connect.
fn ensure_private_target(url: &Url) -> Result<(), String> {
    match url.scheme() {
        "http" | "https" => {}
        scheme => return Err(format!("unsupported scheme: {scheme}")),
    }

    let host = url
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?;
    if host.eq_ignore_ascii_case("localhost") {
        return Ok(());
    }

    let ip: IpAddr = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse()
        .map_err(|_| format!("host not allowed (loopback/private-LAN only): {host}"))?;
    if ip_is_private(&ip) {
        Ok(())
    } else {
        Err(format!(
            "host not allowed (loopback/private-LAN only): {host}"
        ))
    }
}

fn ip_is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            if v6.is_loopback() {
                return true;
            }
            let segments = v6.segments();
            // fc00::/7 unique-local, fe80::/10 link-local.
            (segments[0] & 0xfe00) == 0xfc00 || (segments[0] & 0xffc0) == 0xfe80
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ensure_private_target;
    use reqwest::Url;

    fn check(url: &str) -> bool {
        ensure_private_target(&Url::parse(url).unwrap()).is_ok()
    }

    #[test]
    fn allows_loopback_and_private_lan() {
        assert!(check("http://localhost:8317/v1/models"));
        assert!(check("http://127.0.0.1:8317/v1/models"));
        assert!(check("http://192.168.1.20:8317/"));
        assert!(check("http://10.0.0.5/"));
        assert!(check("http://172.16.4.2/"));
        assert!(check("http://[::1]:8317/"));
    }

    #[test]
    fn rejects_public_hosts_and_schemes() {
        assert!(!check("http://example.com/"));
        assert!(!check("http://8.8.8.8/"));
        assert!(!check("http://172.32.0.1/"));
        assert!(!check("http://[2001:4860:4860::8888]/"));
        assert!(ensure_private_target(&Url::parse("file:///etc/passwd").unwrap()).is_err());
    }
}
