/** Replace protocol product names in user-visible copy. Do not run on URLs or JSON. */

const PHRASE_REPLACEMENTS: readonly [string, string][] = [
  ["MLFLOW_TRACKING_TOKEN", "TENSORLANE_API_KEY"],
  ["MLFLOW_TRACKING_URI", "TENSORLANE_TRACKING_URI"],
  ["MLFLOW_CRYPTO_KEK_PASSPHRASE", "TENSORLANE_ENCRYPTION_KEY"],
  ["pip install mlflow", "pip install tensorlane"],
  ["pip install 'mlflow", "pip install 'tensorlane"],
  ['pip install "mlflow', 'pip install "tensorlane'],
];

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"]);
const ATTRS = ["title", "aria-label", "alt", "placeholder", "aria-description"] as const;

export const REBRAND_CSS = `
svg[viewBox="0 0 109 40"],svg[viewbox="0 0 109 40"],svg[width="109"][height="40"]{
  display:none!important;visibility:hidden!important;width:0!important;height:0!important
}
.tensorlane-wordmark{display:block;font:500 17px/24px Georgia,Times New Roman,serif;
  letter-spacing:.04em;color:inherit}
a[href*="mlflow.org"]{display:none!important}
aside a:has(svg[width="109"]),aside a:has(svg[viewBox="0 0 109 40"]){display:none!important}
img[src*="mlflow.org"],img[src*="MLflow-logo"]{display:none!important}
`.trim();

export function rebrandVisibleText(value: string): string {
  let out = value;
  for (const [from, to] of PHRASE_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out
    .replace(/MLflow/g, "Tensorlane")
    .replace(/Mlflow/g, "Tensorlane")
    .replace(/MLFLOW/g, "TENSORLANE")
    .replace(/mlflow/g, "tensorlane");
}

function vendorUrl(value: string | null): boolean {
  return /mlflow\.org/i.test(value ?? "");
}

function createIn(root: ParentNode, tag: string): HTMLElement {
  const owner = root instanceof Document ? root : (root.ownerDocument ?? document);
  return owner.createElement(tag);
}

function isLogo(svg: Element): boolean {
  const vb = (svg.getAttribute("viewBox") || svg.getAttribute("viewbox") || "").replace(/,/g, " ");
  if (vb.includes("109") && vb.includes("40")) return true;
  if (svg.getAttribute("width") === "109" && svg.getAttribute("height") === "40") return true;
  return (svg.innerHTML || "").includes("31.0316");
}

function hideEl(el: Element): void {
  const style = (el as HTMLElement | SVGElement).style;
  style.setProperty("display", "none", "important");
  style.setProperty("visibility", "hidden", "important");
  style.setProperty("width", "0", "important");
  style.setProperty("height", "0", "important");
  el.setAttribute("hidden", "");
  el.setAttribute("aria-hidden", "true");
}

function maskLogos(root: ParentNode): void {
  root.querySelectorAll("svg").forEach((svg) => {
    if (!isLogo(svg)) return;
    hideEl(svg);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const link = svg.closest("a");
    if (link) hideEl(link);
    const host = link?.parentElement ?? svg.parentElement;
    if (!host) return;
    if (host.querySelector("#tensorlane-sidebar-wordmark")) return;
    const mark = createIn(root, "span");
    mark.id = "tensorlane-sidebar-wordmark";
    mark.className = "tensorlane-wordmark";
    mark.textContent = "tensorlane";
    host.insertBefore(mark, link ?? svg);
  });
}

function hideVendorMedia(root: ParentNode): void {
  root.querySelectorAll("a[href],img[src]").forEach((el) => {
    const url = el.getAttribute("href") || el.getAttribute("src") || "";
    if (!vendorUrl(url)) return;
    hideEl(el);
    if (el.hasAttribute("href")) el.removeAttribute("href");
  });
}

function walk(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const current = node.nodeValue;
    if (!current) return;
    const next = rebrandVisibleText(current);
    if (next !== current) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName)) return;
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const current = el.getAttribute(attr);
    if (!current) continue;
    const next = rebrandVisibleText(current);
    if (next !== current) el.setAttribute(attr, next);
  }
  for (let child = el.firstChild; child; child = child.nextSibling) {
    walk(child);
  }
}

function ensureChromeStyles(doc: Document): void {
  if (doc.getElementById("tensorlane-rebrand-css")) return;
  const style = doc.createElement("style");
  style.id = "tensorlane-rebrand-css";
  style.textContent = REBRAND_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function paint(doc: Document): void {
  if (doc.title) doc.title = rebrandVisibleText(doc.title);
  if (doc.body) walk(doc.body);
  maskLogos(doc);
  hideVendorMedia(doc);
}

export function injectTrackingRebrand(doc: Document): () => void {
  const marked = doc.documentElement;
  if (marked?.getAttribute("data-tensorlane-rebrand") === "1") {
    ensureChromeStyles(doc);
    paint(doc);
    return () => undefined;
  }
  marked?.setAttribute("data-tensorlane-rebrand", "1");
  ensureChromeStyles(doc);

  let scheduled = false;
  const run = () => {
    scheduled = false;
    paint(doc);
  };
  const schedule = () => {
    paint(doc);
    if (scheduled) return;
    scheduled = true;
    const raf = doc.defaultView?.requestAnimationFrame ?? requestAnimationFrame;
    raf.call(doc.defaultView ?? window, run);
  };

  paint(doc);
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS, "href", "src"],
  });
  return () => observer.disconnect();
}
