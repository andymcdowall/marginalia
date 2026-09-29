// Phase 0, Spike A: exercises `pdf::pdf_render` end-to-end with hardcoded 3-page HTML, gated
// behind an env var so it never runs in normal use. Delete this file (and the `setup()` call
// into it) once Phase 6 wires the real Export dialog to `pdf_render`.
use tauri::AppHandle;

const HTML: &str = r#"<!doctype html>
<html><head><style>
  @page { margin: 0.75in; }
  body { margin: 0; font-family: -apple-system, sans-serif; }
  .page { min-height: 9in; box-sizing: border-box; break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  h1 { font-size: 28px; }
</style></head>
<body>
  <div class="page"><h1>Marginalia PDF spike</h1><p>Page one content.</p></div>
  <div class="page"><h1>Page two</h1><p>Page two content.</p></div>
  <div class="page"><h1>Page three</h1><p>Page three content.</p></div>
</body></html>"#;

pub fn maybe_run(app: AppHandle) {
    if std::env::var("MARGINALIA_SPIKE_PDF").is_err() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = crate::pdf::pdf_render(
            app,
            HTML.to_string(),
            String::new(),
            "letter".to_string(),
            54.0,
        )
        .await;
        match &result {
            Ok(()) => eprintln!("SPIKE_A_RESULT: ok, preview window opened"),
            Err(e) => eprintln!("SPIKE_A_RESULT: error {e}"),
        }
    });
}
