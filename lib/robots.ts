// Basit robots.txt ayrıştırıcı (RFC 9309): user-agent grupları, Allow/Disallow, "*" ve "$" desenleri.
// En uzun eşleşen kural kazanır; eşitlikte Allow kazanır.

export type RobotsRules = { allow: string[]; disallow: string[] };

export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [] };
export const DISALLOW_ALL: RobotsRules = { allow: [], disallow: ["/"] };

type Group = { agents: string[]; allow: string[]; disallow: string[] };

export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    else if (key === "disallow" && value) current.disallow.push(value);
  }

  const token = agentToken.toLowerCase();
  let matched = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  if (matched.length === 0) matched = groups.filter((g) => g.agents.includes("*"));

  return {
    allow: matched.flatMap((g) => g.allow),
    disallow: matched.flatMap((g) => g.disallow),
  };
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

/** path: "/a/b?x=1" biçiminde (pathname + search). */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  let bestLength = -1;
  let allowed = true;
  const candidates = [
    ...rules.disallow.map((p) => ({ p, allow: false })),
    ...rules.allow.map((p) => ({ p, allow: true })),
  ];
  for (const { p, allow } of candidates) {
    if (!patternMatches(p, path)) continue;
    if (p.length > bestLength || (p.length === bestLength && allow)) {
      bestLength = p.length;
      allowed = allow;
    }
  }
  return allowed;
}
