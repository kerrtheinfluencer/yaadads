/* Public release-note safeguard. No network, environment reads or source execution.
 * Heuristic checks supplement editorial review; they are not a full secret scanner.
 * Never include matched content in errors or logs. */
const BLOCKED = [
  /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|service[_ -]?role[_ -]?key|password)\s*["']?\s*[:=]\s*["']?[^\s,'";]{4,}/i,
  /\bBearer\s+[A-Za-z0-9._~-]{12,}/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/i,
  /[A-Z]:[\\/]+Users[\\/]|\/(?:home|Users)\/[^\s/]+/i,
  /\b[\w.-]+\.sql\b|\bdeployment note\s*:|\bdatabase migration\b/i,
];
function assertPublicNotes(text) {
  if (typeof text !== 'string' || BLOCKED.some(pattern => pattern.test(text))) {
    throw new Error('Public release notes failed privacy validation. Review locally; matched content is not logged.');
  }
}
module.exports = { assertPublicNotes };
