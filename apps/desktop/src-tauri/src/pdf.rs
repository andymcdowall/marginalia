use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Fallback path from SPEC.md §11.3: the primary native `NSPrintOperation` approach (a hidden or
/// off-screen-positioned webview window driving `runOperationModalForWindow:` /
/// `createPDFWithConfiguration:`) reliably deadlocked in this environment — even the plain
/// synchronous `-runOperation` call never returned. Root cause looks like WKWebView's
/// out-of-process renderer never compositing a frame for a window that isn't genuinely on
/// screen, but that needs a real display to confirm; see DECISIONS.md for what was tried.
///
/// Instead, this opens a real, visible "Export preview" window with a Print… banner that calls
/// `window.print()`, and resolves as soon as the window is showing content. The person then uses
/// "Save as PDF" in the native print dialog themselves.
#[tauri::command]
pub async fn pdf_render(
    app: AppHandle,
    html: String,
    _out_path: String,
    _page_size: String,
    _margin_pt: f64,
) -> Result<(), String> {
    let n = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("pdf-preview-{n}");

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("print.html".into()))
        .title("Export Preview")
        .inner_size(900.0, 1100.0)
        .build()
        .map_err(|e| e.to_string())?;

    let escaped = serde_json::to_string(&html).map_err(|e| e.to_string())?;
    let write_script = format!("document.open();document.write({escaped});document.close();");
    window.eval(&write_script).map_err(|e| e.to_string())?;

    // A separate eval (rather than folding into the write above) so it doesn't need to care
    // about the internal structure of the exported document.
    let banner_script = r#"(function(){
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px 12px;background:#f5f5f5;border-bottom:1px solid #ccc;font-family:-apple-system,sans-serif;font-size:13px;z-index:2147483647;';
  bar.innerHTML = '<button id="__marginalia_print" style="padding:4px 12px;">Print…</button><span style="margin-left:8px;color:#555;">Use &quot;Save as PDF&quot; in the print dialog.</span>';
  document.body.insertBefore(bar, document.body.firstChild);
  document.body.style.marginTop = '40px';
  document.getElementById('__marginalia_print').addEventListener('click', function(){ window.print(); });
})();"#;
    window.eval(banner_script).map_err(|e| e.to_string())?;

    Ok(())
}
