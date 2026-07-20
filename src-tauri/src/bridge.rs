use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io;
use std::net::TcpListener as StdTcpListener;
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex, Semaphore};
use uuid::Uuid;

const MAX_BODY_BYTES: usize = 256 * 1024;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_PARKED_WAITS: usize = 64;
const MAX_CONNECTIONS: usize = 32;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const WAIT_TIMEOUT: Duration = Duration::from_secs(300);

type PendingResponses = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

#[derive(Clone)]
pub struct BridgeState {
    port: u16,
    token: Arc<str>,
    pending: PendingResponses,
}

impl BridgeState {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeInfo {
    port: u16,
    token: String,
}

/// The bridge is payload-agnostic: any JSON object rides the `bridge://stage`
/// event to the frontend unchanged, and the frontend routes by the payload's
/// `t` kind. Alongside the Stage card kinds (copy/link/img/widget/table/json/
/// md/diff/progress/confirm/choice/ask), v0.4.0 adds the board/memory/attention
/// verbs: `task.progress`, `task.done`, `task.blocked` (`{t,id,msg?}`),
/// `memory.write` (`{t,name,desc?,links?,body?}`), and `attention.ask` (alias
/// of `ask`). The shim (`helm task ...`, `helm memory add ...`) emits them over
/// this same OSC/HTTP path.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StageRequest {
    pane: String,
    payload: Value,
    wait: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StageEvent {
    pane: String,
    payload: Value,
    request_id: String,
}

struct ParsedRequest {
    body: Vec<u8>,
}

enum RequestError {
    BadRequest,
    Unauthorized,
    NotFound,
    PayloadTooLarge,
}

pub fn start(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let listener = StdTcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let token_bytes: [u8; 32] = rand::random();
    let token: String = token_bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let state = BridgeState {
        port,
        token: Arc::from(token),
        pending: Arc::new(Mutex::new(HashMap::new())),
    };
    let task_state = state.clone();
    let app_handle = app.handle().clone();

    app.manage(state);
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::from_std(listener) else {
            return;
        };
        run_listener(listener, app_handle, task_state).await;
    });

    Ok(())
}

#[tauri::command]
pub fn bridge_info(state: tauri::State<'_, BridgeState>) -> BridgeInfo {
    BridgeInfo {
        port: state.port,
        token: state.token.to_string(),
    }
}

#[tauri::command]
pub async fn bridge_respond(
    state: tauri::State<'_, BridgeState>,
    request_id: String,
    response: String,
) -> Result<bool, String> {
    let pending = Arc::clone(&state.pending);
    let sender = pending.lock().await.remove(&request_id);

    Ok(sender
        .map(|sender| sender.send(response).is_ok())
        .unwrap_or(false))
}

async fn run_listener(
    listener: TcpListener,
    app: tauri::AppHandle,
    state: BridgeState,
) {
    let connections = Arc::new(Semaphore::new(MAX_CONNECTIONS));
    loop {
        let Ok((stream, _peer)) = listener.accept().await else {
            break;
        };
        let Ok(permit) = Arc::clone(&connections).try_acquire_owned() else {
            continue;
        };
        let app = app.clone();
        let state = state.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            let _ = handle_connection(stream, app, state).await;
        });
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    app: tauri::AppHandle,
    state: BridgeState,
) -> io::Result<()> {
    let request = match tokio::time::timeout(
        REQUEST_TIMEOUT,
        read_request(&mut stream, state.token()),
    )
    .await
    {
        Ok(request) => request,
        Err(_) => return Ok(()),
    };
    let request = match request {
        Ok(request) => request,
        Err(RequestError::BadRequest) => {
            return write_error(&mut stream, 400, "Bad Request", "bad_request").await;
        }
        Err(RequestError::Unauthorized) => {
            return write_error(&mut stream, 401, "Unauthorized", "unauthorized").await;
        }
        Err(RequestError::NotFound) => {
            return write_error(&mut stream, 404, "Not Found", "not_found").await;
        }
        Err(RequestError::PayloadTooLarge) => {
            return write_error(
                &mut stream,
                413,
                "Payload Too Large",
                "payload_too_large",
            )
            .await;
        }
    };

    let request: StageRequest = match serde_json::from_slice(&request.body) {
        Ok(request) => request,
        Err(_) => {
            return write_error(&mut stream, 400, "Bad Request", "bad_request").await;
        }
    };
    if request.pane.chars().count() > 128 || !request.payload.is_object() {
        return write_error(&mut stream, 400, "Bad Request", "bad_request").await;
    }

    let request_id = Uuid::new_v4().to_string();
    let event = StageEvent {
        pane: request.pane,
        payload: request.payload,
        request_id: request_id.clone(),
    };

    if !request.wait {
        if app.emit("bridge://stage", event).is_err() {
            return write_error(
                &mut stream,
                500,
                "Internal Server Error",
                "event_emit_failed",
            )
            .await;
        }
        return write_json(
            &mut stream,
            202,
            "Accepted",
            &json!({ "ok": true }),
        )
        .await;
    }

    let (sender, receiver) = oneshot::channel();
    {
        let mut pending = state.pending.lock().await;
        if pending.len() >= MAX_PARKED_WAITS {
            return write_error(&mut stream, 429, "Too Many Requests", "too_many_waits")
                .await;
        }
        pending.insert(request_id.clone(), sender);
    }

    if app.emit("bridge://stage", event).is_err() {
        state.pending.lock().await.remove(&request_id);
        return write_error(
            &mut stream,
            500,
            "Internal Server Error",
            "event_emit_failed",
        )
        .await;
    }

    match tokio::time::timeout(WAIT_TIMEOUT, receiver).await {
        Ok(Ok(response)) => {
            write_json(
                &mut stream,
                200,
                "OK",
                &json!({ "ok": true, "response": response }),
            )
            .await
        }
        Ok(Err(_)) | Err(_) => {
            state.pending.lock().await.remove(&request_id);
            write_error(&mut stream, 504, "Gateway Timeout", "timeout").await
        }
    }
}

async fn read_request(
    stream: &mut TcpStream,
    expected_token: &str,
) -> Result<ParsedRequest, RequestError> {
    let mut buffer = Vec::with_capacity(4096);
    let header_end = loop {
        if let Some(index) = find_header_end(&buffer) {
            break index;
        }
        if buffer.len() >= MAX_HEADER_BYTES {
            return Err(RequestError::BadRequest);
        }

        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|_| RequestError::BadRequest)?;
        if read == 0 {
            return Err(RequestError::BadRequest);
        }
        buffer.extend_from_slice(&chunk[..read]);
    };

    if header_end > MAX_HEADER_BYTES {
        return Err(RequestError::BadRequest);
    }
    let headers = std::str::from_utf8(&buffer[..header_end])
        .map_err(|_| RequestError::BadRequest)?;
    let mut lines = headers.split("\r\n");
    let request_line = lines.next().ok_or(RequestError::BadRequest)?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().ok_or(RequestError::BadRequest)?;
    let path = request_parts.next().ok_or(RequestError::BadRequest)?;
    let version = request_parts.next().ok_or(RequestError::BadRequest)?;
    if request_parts.next().is_some() || version != "HTTP/1.1" {
        return Err(RequestError::BadRequest);
    }
    if method != "POST" || path != "/stage" {
        return Err(RequestError::NotFound);
    }

    let mut authorization = None;
    let mut content_type = None;
    let mut content_length = None;
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(RequestError::BadRequest)?;
        let name = name.trim();
        let value = value.trim();
        if name.is_empty() {
            return Err(RequestError::BadRequest);
        }

        if name.eq_ignore_ascii_case("authorization") {
            if authorization.replace(value).is_some() {
                return Err(RequestError::BadRequest);
            }
        } else if name.eq_ignore_ascii_case("content-type") {
            if content_type.replace(value).is_some() {
                return Err(RequestError::BadRequest);
            }
        } else if name.eq_ignore_ascii_case("content-length") {
            if content_length.replace(value).is_some() {
                return Err(RequestError::BadRequest);
            }
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(RequestError::BadRequest);
        }
    }

    let supplied_token = authorization
        .and_then(parse_bearer_token)
        .ok_or(RequestError::Unauthorized)?;
    if !token_matches(supplied_token, expected_token) {
        return Err(RequestError::Unauthorized);
    }
    if !content_type
        .map(|value| value.eq_ignore_ascii_case("application/json"))
        .unwrap_or(false)
    {
        return Err(RequestError::BadRequest);
    }

    let content_length = content_length
        .ok_or(RequestError::BadRequest)?
        .parse::<usize>()
        .map_err(|_| RequestError::BadRequest)?;
    if content_length > MAX_BODY_BYTES {
        return Err(RequestError::PayloadTooLarge);
    }

    let body_start = header_end + 4;
    while buffer.len().saturating_sub(body_start) < content_length {
        let remaining = content_length - buffer.len().saturating_sub(body_start);
        let mut chunk = [0_u8; 8192];
        let read_length = remaining.min(chunk.len());
        let read = stream
            .read(&mut chunk[..read_length])
            .await
            .map_err(|_| RequestError::BadRequest)?;
        if read == 0 {
            return Err(RequestError::BadRequest);
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    Ok(ParsedRequest {
        body: buffer[body_start..body_start + content_length].to_vec(),
    })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_bearer_token(value: &str) -> Option<&str> {
    let (scheme, token) = value.split_once(' ')?;
    if scheme.eq_ignore_ascii_case("bearer") && !token.is_empty() && !token.contains(char::is_whitespace) {
        Some(token)
    } else {
        None
    }
}

fn token_matches(supplied: &str, expected: &str) -> bool {
    supplied.len() == expected.len()
        && bool::from(supplied.as_bytes().ct_eq(expected.as_bytes()))
}

async fn write_error(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    error: &str,
) -> io::Result<()> {
    write_json(stream, status, reason, &json!({ "error": error })).await
}

async fn write_json(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    body: &Value,
) -> io::Result<()> {
    let body = serde_json::to_vec(body).map_err(io::Error::other)?;
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(headers.as_bytes()).await?;
    stream.write_all(&body).await?;
    stream.shutdown().await
}
