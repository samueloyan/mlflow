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

export function injectTrackingRebrand(doc: Document): () => void {
  const marked = doc.documentElement;
  if (marked?.getAttribute("data-tensorlane-rebrand") === "1") {
    return () => undefined;
  }
  marked?.setAttribute("data-tensorlane-rebrand", "1");

  let scheduled = false;
  const run = () => {
    scheduled = false;
    if (doc.title) doc.title = rebrandVisibleText(doc.title);
    if (doc.body) walk(doc.body);
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
    attributeFilter: [...ATTRS],
  });
  return () => observer.disconnect();
}
