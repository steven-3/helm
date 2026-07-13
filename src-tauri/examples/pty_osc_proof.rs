//! Headless proof of helm's backend differentiator path: spawn a real PTY, run
//! the `helm` shim inside it with helm's env injection, and confirm the OSC 5379
//! sequence is emitted and streamed back off the PTY reader — the exact
//! portable-pty primitives `src/pty.rs` uses.
//!
//!   cargo run --example pty_osc_proof
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;

fn main() {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .expect("openpty");

    let mut cmd = CommandBuilder::new("bash");
    cmd.arg("-c");
    cmd.arg("helm copy --label pane-token hello_from_pty; sleep 0.2");
    // helm's env injection (mirrors pty.rs apply_environment)
    cmd.env("HELM", "1");
    cmd.env("HELM_PANE", "proof");
    let shim = concat!(env!("CARGO_MANIFEST_DIR"), "/../shim");
    let path = format!("{}:{}", shim, std::env::var("PATH").unwrap_or_default());
    cmd.env("PATH", path);

    let mut child = pair.slave.spawn_command(cmd).expect("spawn");
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().expect("reader");

    let mut out = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => out.extend_from_slice(&buf[..n]),
            Err(_) => break,
        }
    }
    let _ = child.wait();

    let s = String::from_utf8_lossy(&out);
    let osc_start = "\x1b]5379;";
    if s.contains(osc_start) && s.contains("hello_from_pty") {
        println!("PROOF PASS: shim emitted OSC 5379 inside a real PTY, streamed back off the reader");
        if let Some(i) = s.find(osc_start) {
            let tail = &s[i..];
            if let Some(j) = tail.find('\u{7}') {
                println!("captured sequence: {:?}", &tail[..=j]);
            }
        }
    } else {
        eprintln!("PROOF FAIL: OSC 5379 not found in {} bytes of PTY output:\n{}", out.len(), s);
        std::process::exit(1);
    }
}
