"""User-visible Tensorlane branding for HTML chrome. Protocol paths stay unchanged."""

from __future__ import annotations

import re

PRODUCT_NAME = "Tensorlane"

_PHRASE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("MLFLOW_TRACKING_TOKEN", "TENSORLANE_API_KEY"),
    ("MLFLOW_TRACKING_URI", "TENSORLANE_TRACKING_URI"),
    ("MLFLOW_CRYPTO_KEK_PASSPHRASE", "TENSORLANE_ENCRYPTION_KEY"),
    ("pip install mlflow", "pip install tensorlane"),
    ("pip install 'mlflow", "pip install 'tensorlane"),
    ('pip install "mlflow', 'pip install "tensorlane'),
)

_TITLE_RE = re.compile(r"(<title\b[^>]*>)(.*?)(</title>)", re.IGNORECASE | re.DOTALL)

# Hide the protocol wordmark SVG (letterforms, not text) and vendor docs links.
# Do not include the substring "</style>".
REBRAND_CSS = """
svg[viewBox="0 0 109 40"],svg[viewbox="0 0 109 40"],svg[width="109"][height="40"]{
  display:none!important;visibility:hidden!important;width:0!important;height:0!important
}
.tensorlane-wordmark{display:block;font:500 17px/24px Georgia,Times New Roman,serif;
  letter-spacing:.04em;color:inherit}
a[href*="mlflow.org"]{display:none!important}
aside a:has(svg[width="109"]),aside a:has(svg[viewBox="0 0 109 40"]){display:none!important}
img[src*="mlflow.org"],img[src*="MLflow-logo"]{display:none!important}
""".strip()

# Runs in the tracking workbench. Do not include the substring "</script>".
REBRAND_JS = r"""
(function(){
  if (window.__tensorlaneRebrand) return;
  window.__tensorlaneRebrand = true;
  var phrases = [
    ["MLFLOW_TRACKING_TOKEN","TENSORLANE_API_KEY"],
    ["MLFLOW_TRACKING_URI","TENSORLANE_TRACKING_URI"],
    ["MLFLOW_CRYPTO_KEK_PASSPHRASE","TENSORLANE_ENCRYPTION_KEY"],
    ["pip install mlflow","pip install tensorlane"],
    ["pip install 'mlflow","pip install 'tensorlane"],
    ["pip install \"mlflow","pip install \"tensorlane"]
  ];
  function swap(s){
    if (!s) return s;
    var out = String(s);
    for (var i = 0; i < phrases.length; i++) out = out.split(phrases[i][0]).join(phrases[i][1]);
    return out.replace(/MLflow/g,"Tensorlane").replace(/Mlflow/g,"Tensorlane")
      .replace(/MLFLOW/g,"TENSORLANE").replace(/mlflow/g,"tensorlane");
  }
  function skip(el){
    var tag = el && el.nodeName;
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "IFRAME";
  }
  function vendorUrl(v){
    return /mlflow\.org/i.test(v || "");
  }
  function isLogo(svg){
    var vb = String(svg.getAttribute("viewBox") || svg.getAttribute("viewbox") || "").replace(/,/g," ");
    if (vb.indexOf("109") >= 0 && vb.indexOf("40") >= 0) return true;
    if (svg.getAttribute("width") === "109" && svg.getAttribute("height") === "40") return true;
    var inner = svg.innerHTML || "";
    return inner.indexOf("31.0316") >= 0;
  }
  function hideEl(el){
    el.style.setProperty("display","none","important");
    el.style.setProperty("visibility","hidden","important");
    el.style.setProperty("width","0","important");
    el.style.setProperty("height","0","important");
    el.setAttribute("hidden","");
    el.setAttribute("aria-hidden","true");
  }
  function chrome(root){
    if (!root || !root.querySelectorAll) return;
    var svgs = root.querySelectorAll("svg");
    for (var i = 0; i < svgs.length; i++){
      var svg = svgs[i];
      if (!isLogo(svg)) continue;
      var link = svg.closest ? svg.closest("a") : svg.parentNode;
      var host = (link && link.nodeName === "A") ? link.parentNode : svg.parentNode;
      if (link && link.nodeName === "A"){
        if (link.getAttribute("data-tensorlane-hidden-logo") !== "1"){
          hideEl(link);
          link.setAttribute("data-tensorlane-hidden-logo","1");
        }
      } else {
        hideEl(svg);
      }
      if (!host) continue;
      if (document.getElementById("tensorlane-sidebar-wordmark")) continue;
      var mark = document.createElement("span");
      mark.id = "tensorlane-sidebar-wordmark";
      mark.className = "tensorlane-wordmark";
      mark.textContent = "tensorlane";
      host.insertBefore(mark, (link && link.nodeName === "A") ? link : svg);
    }
    var media = root.querySelectorAll("a[href],img[src]");
    for (var j = 0; j < media.length; j++){
      var el = media[j];
      if (el.getAttribute("data-tensorlane-hidden-logo") === "1") continue;
      var url = el.getAttribute("href") || el.getAttribute("src") || "";
      if (!vendorUrl(url)) continue;
      hideEl(el);
      if (el.hasAttribute("href")) el.removeAttribute("href");
    }
  }
  function walk(node){
    if (!node) return;
    if (node.nodeType === 3){
      var next = swap(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1 || skip(node)) return;
    var attrs = ["title","aria-label","alt","placeholder","aria-description"];
    for (var i = 0; i < attrs.length; i++){
      var a = attrs[i];
      if (node.hasAttribute && node.hasAttribute(a)){
        var v = node.getAttribute(a);
        var n = swap(v);
        if (n !== v) node.setAttribute(a, n);
      }
    }
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  var paused = false;
  var scheduled = false;
  function run(){
    scheduled = false;
    if (document.title) document.title = swap(document.title);
    if (document.body) walk(document.body);
    chrome(document);
  }
  function schedule(){
    if (paused) return;
    chrome(document);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }
  run();
  new MutationObserver(function(){
    if (paused) return;
    paused = true;
    try { chrome(document); }
    finally { paused = false; }
    schedule();
  }).observe(document.documentElement,{
    childList:true,subtree:true,characterData:true,attributes:true,
    attributeFilter:["title","aria-label","alt","placeholder","aria-description","href","src"]
  });
})();
""".strip()

_CHROME_TAG = (
    '<style data-tensorlane-rebrand-css="1">'
    + REBRAND_CSS
    + "</style>"
    + '<script data-tensorlane-rebrand="1">'
    + REBRAND_JS
    + "</script>"
)


def rebrand_visible_text(value: str) -> str:
    """Replace protocol product names in user-visible copy. Do not use on URLs or JSON."""
    out = value
    for source, target in _PHRASE_REPLACEMENTS:
        out = out.replace(source, target)
    return (
        out
        .replace("MLflow", PRODUCT_NAME)
        .replace("Mlflow", PRODUCT_NAME)
        .replace("MLFLOW", "TENSORLANE")
        .replace("mlflow", "tensorlane")
    )


def tracking_unavailable_html() -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>Tensorlane</title>"
        "<style>body{font-family:Georgia,serif;background:#f3efe6;color:#161410;"
        "margin:0;padding:48px;line-height:1.5} h1{font-weight:500} p{color:#6d675c}"
        "</style></head><body><p style='letter-spacing:.16em;text-transform:uppercase;"
        "color:#b85a28;font-size:11px'>Tensorlane</p><h1>Tracking is not available in this "
        "environment.</h1><p>Start the Tensorlane stack and the workbench will load here, "
        "same origin, with Tensorlane chrome around it.</p></body></html>"
    )


def inject_tracking_rebrand(html: bytes | str) -> bytes:
    """Rewrite tracking UI chrome: Tensorlane title, wordmark, and copy."""
    text = html.decode("utf-8", errors="replace") if isinstance(html, (bytes, bytearray)) else html
    if "data-tensorlane-rebrand" in text:
        return text.encode("utf-8")

    def _title(match: re.Match[str]) -> str:
        return match.group(1) + rebrand_visible_text(match.group(2)) + match.group(3)

    text = _TITLE_RE.sub(_title, text, count=1)
    lowered = text.lower()
    if "</head>" in lowered:
        idx = lowered.rfind("</head>")
        text = text[:idx] + _CHROME_TAG + text[idx:]
    elif "<body" in lowered:
        match = re.search(r"<body[^>]*>", text, flags=re.IGNORECASE)
        if match:
            insert_at = match.end()
            text = text[:insert_at] + _CHROME_TAG + text[insert_at:]
        else:
            text = _CHROME_TAG + text
    else:
        text = _CHROME_TAG + text
    return text.encode("utf-8")


def is_tracking_html(method: str, content_type: str | None) -> bool:
    if method.upper() not in {"GET", "HEAD"}:
        return False
    if not content_type:
        return False
    return "html" in content_type.lower()
