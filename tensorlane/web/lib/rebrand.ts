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
const LOGO_SELECTOR = 'svg[viewBox="0 0 109 40"],svg[width="109"][height="40"]';

export const REBRAND_CSS = `
svg[viewBox="0 0 109 40"],svg[width="109"][height="40"]{display:none!important}
a:has(svg[viewBox="0 0 109 40"])::after,a:has(svg[width="109"][height="40"])::after{
  content:"tensorlane";display:block;font:500 17px/24px Georgia,Times New Roman,serif;
  letter-spacing:.04em;color:inherit
}
.tensorlane-wordmark{display:block;font:500 17px/24px Georgia,Times New Roman,serif;
  letter-spacing:.04em;color:inherit}
a[href*="mlflow.org" i]{display:none!important}
img[src*="mlflow.org" i],img[src*="MLflow-logo" i]{display:none!important}
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
  const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
  return doc.createElement(tag);
}

function maskLogos(root: ParentNode): void {
  const svgs = root.querySelectorAll(LOGO_SELECTOR);
  svgs.forEach((svg) => {
    const parent = svg.parentElement;
    if (!parent || parent.tagName === "A") return;
    if (parent.querySelector(".tensorlane-wordmark")) return;
    const mark = createIn(root, "span");
    mark.className = "tensorlane-wordmark";
    mark.textContent = "tensorlane";
    parent.insertBefore(mark, svg);
  });
}

function hideVendorMedia(root: ParentNode): void {
  root.querySelectorAll("a[href],img[src]").forEach((el) => {
    const url = el.getAttribute("href") || el.getAttribute("src") || "";
    if (!vendorUrl(url)) return;
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
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

export function injectTrackingRebrand(doc: Document): () => void {
  const marked = doc.documentElement;
  if (marked?.getAttribute("data-tensorlane-rebrand") === "1") {
    ensureChromeStyles(doc);
    return () => undefined;
  }
  marked?.setAttribute("data-tensorlane-rebrand", "1");
  ensureChromeStyles(doc);

  let scheduled = false;
  const run = () => {
    scheduled = false;
    if (doc.title) doc.title = rebrandVisibleText(doc.title);
    if (doc.body) walk(doc.body);
    maskLogos(doc);
    hideVendorMedia(doc);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const raf = doc.defaultView?.requestAnimationFrame ?? requestAnimationFrame;
    raf.call(doc.defaultView ?? window, run);
  };

  run();
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
