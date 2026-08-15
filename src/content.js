const ALLOWED = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "BR",
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
]);

export function sanitizeContentHtml(input = "") {
  const doc = new DOMParser().parseFromString(
    `<div>${input}</div>`,
    "text/html",
  );
  const root = doc.body.firstElementChild;
  for (const element of [...root.querySelectorAll("*")]) {
    if (!ALLOWED.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes])
      element.removeAttribute(attribute.name);
  }
  return root.innerHTML;
}

export function contentToText(html = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
