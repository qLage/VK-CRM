from pathlib import Path


def patch_index_html(path: Path) -> bool:
    html = path.read_text(encoding="utf-8")
    marker = 'id="object-create-dialog-fix"'
    script = """<script id="object-create-dialog-fix">(function(){
  function isObjectDialog(d){
    var txt = (d.textContent || '').toLowerCase();
    return txt.includes('новый объект') || txt.includes('создать объект') || txt.includes('категория объекта');
  }
  function applyWide(d){
    if (!d || d.dataset.objectDialogWideApplied === '1') return;
    d.style.setProperty('--dialog-content-max-width','1500px');
    d.style.maxWidth = '1500px';
    d.style.width = 'calc(100vw - 1.5rem)';
    d.dataset.objectDialogWideApplied = '1';
  }
  function scanAndApply(){
    var dialogs = document.querySelectorAll('[role="dialog"][data-state="open"], [role="dialog"]');
    dialogs.forEach(function(d){ if (isObjectDialog(d)) applyWide(d); });
  }
  function observeBriefly(ms){
    var done = false;
    var obs = new MutationObserver(function(){ scanAndApply(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    scanAndApply();
    setTimeout(function(){
      if (done) return;
      done = true;
      obs.disconnect();
    }, ms || 1200);
  }
  window.addEventListener('DOMContentLoaded', function(){ observeBriefly(2200); }, { once: true });
  document.addEventListener('click', function(){
    observeBriefly(1200);
    setTimeout(scanAndApply, 0);
  }, true);
})();</script>"""

    if marker in html:
        start = html.find("<script id=\"object-create-dialog-fix\">")
        end = html.find("</script>", start)
        if start != -1 and end != -1:
            end += len("</script>")
            html = html[:start] + script + html[end:]
            path.write_text(html, encoding="utf-8")
            return True
        return False

    path.write_text(html.replace("</body>", script + "\n  </body>"), encoding="utf-8")
    return True


def main() -> int:
    project = Path("/root/CRM")
    bundle = project / "dist/assets/index-CfEj8SIe.js"
    backup = project / "dist/assets/index-CfEj8SIe.js.bak"
    index_html = project / "dist/index.html"

    if backup.exists():
        bundle.write_bytes(backup.read_bytes())

    changed = patch_index_html(index_html)
    print("index.html patched" if changed else "index.html already patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
