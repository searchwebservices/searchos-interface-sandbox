/**
 * Ask Jared context shim. The CRM runs in an iframe of the console. On every
 * hash change it tells the parent where the user is, and it follows the
 * parent's theme.
 */

export type CrmContext = {
  type: "crm.context";
  route: string;
  resource: string | null;
  id: string | null;
  title: string | null;
  /** Company page tab ("searchos", "contacts", ...); absent on the default Activity tab and everywhere else. */
  tab?: string;
  /** Set by "Ask Jared about this": the dock opens its composer with `prompt` filled in. */
  ask?: true;
  prompt?: string;
};

export const ASK_PROMPT_MAX = 2000;

/**
 * "Ask Jared about this": the same context message, with `ask: true` and the
 * prefilled prompt. Returns false when the CRM is not inside the console.
 */
export function askJared(prompt: string, win: Window = window): boolean {
  if (win.parent === win) return false;
  const text = prompt.replace(/\s+/g, " ").trim().slice(0, ASK_PROMPT_MAX);
  if (!text) return false;
  win.parent.postMessage(
    {
      ...buildContext(win.location.hash, readTitle(win.document)),
      ask: true,
      prompt: text,
    },
    win.location.origin,
  );
  return true;
}

const RESOURCES = ["contacts", "deals", "companies"] as const;

export function parseCrmHash(hash: string): {
  resource: string | null;
  id: string | null;
  tab?: string;
} {
  const path = hash.replace(/^#/, "").split("?")[0];
  const match = path.match(
    /^\/(contacts|deals|companies)\/([^/]+)(?:\/show(?:\/([^/]+))?)?\/?$/,
  );
  if (!match || !RESOURCES.includes(match[1] as (typeof RESOURCES)[number])) {
    return { resource: null, id: null };
  }
  const id = decodeURIComponent(match[2]);
  if (id === "create") return { resource: match[1], id: null };
  const tab = match[3] ? decodeURIComponent(match[3]) : undefined;
  return tab ? { resource: match[1], id, tab } : { resource: match[1], id };
}

/** Best effort: the record name is the first heading the page renders. */
export function readTitle(doc: Document): string | null {
  const heading =
    doc.querySelector("[data-crm-title]") ??
    doc.querySelector("main h1, h1, main h2");
  const text = heading?.textContent?.trim();
  return text ? text.slice(0, 200) : null;
}

export function buildContext(hash: string, title: string | null): CrmContext {
  const { resource, id, tab } = parseCrmHash(hash);
  return {
    type: "crm.context",
    route: hash,
    resource,
    id,
    title,
    ...(tab ? { tab } : {}),
  };
}

export function applyTheme(doc: Document, value: unknown) {
  if (value !== "light" && value !== "dark") return;
  const root = doc.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(value);
  root.dataset.theme = value;
}

export function startContextShim(win: Window = window): () => void {
  const post = (title: string | null) => {
    if (win.parent === win) return;
    win.parent.postMessage(
      buildContext(win.location.hash, title),
      win.location.origin,
    );
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const onHashChange = () => {
    post(null);
    if (timer) clearTimeout(timer);
    // The record name only exists once the page has rendered.
    timer = setTimeout(() => {
      const title = readTitle(win.document);
      if (title) post(title);
    }, 700);
  };

  // Once the parent has chosen, keep it: the app's own theme provider rewrites
  // the class when it mounts.
  let parentTheme: "light" | "dark" | null = null;
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          if (
            parentTheme &&
            !win.document.documentElement.classList.contains(parentTheme)
          ) {
            applyTheme(win.document, parentTheme);
          }
        });
  observer?.observe(win.document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== win.location.origin) return;
    if (event.source !== win.parent) return;
    const data = event.data;
    if (
      data &&
      data.type === "theme" &&
      (data.value === "light" || data.value === "dark")
    ) {
      parentTheme = data.value;
      applyTheme(win.document, data.value);
    }
    // The console moved its address while the CRM was open: follow it (hash routes only).
    if (
      data &&
      data.type === "crm.navigate" &&
      typeof data.hash === "string" &&
      /^#\/[\w\-./%?=&]*$/.test(data.hash) &&
      data.hash !== win.location.hash
    ) {
      win.location.hash = data.hash;
    }
    if (
      data &&
      data.type === "density" &&
      ["small", "medium", "large", "enormous"].includes(data.value)
    ) {
      win.document.documentElement.dataset.density = data.value;
    }
  };

  // Theme from the OS until the parent says otherwise.
  const dark = win.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(win.document, dark ? "dark" : "light");

  win.addEventListener("hashchange", onHashChange);
  win.addEventListener("message", onMessage);
  onHashChange();

  return () => {
    if (timer) clearTimeout(timer);
    observer?.disconnect();
    win.removeEventListener("hashchange", onHashChange);
    win.removeEventListener("message", onMessage);
  };
}
