import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const listing = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
if (listing.status !== 0) throw new Error("Unable to enumerate tracked files for the secret scan.");
const files = listing.stdout.split("\0").filter(Boolean);

const forbiddenFile = /(^|\/)(?:\.env(?:\..+)?|secrets?(?:\..+)?|tokens?(?:\..+)?|credentials?(?:\..+)?|[^/]+\.(?:pem|p12|pfx|key))$/i;
const allowedEnvironmentTemplate = /(^|\/)\.env\.example$/;
const secretPatterns = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g,
  /\bGOCSPX-[A-Za-z0-9_-]{12,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  /(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|CLIENT_SECRET|OAUTH_TOKEN)[ \t]*=[ \t]*[^\s#][^\r\n]*/gi,
];
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const allowedEmailDomains = new Set(["example.com", "example.invalid", "users.noreply.github.com"]);
let fileViolations = 0;
let valueViolations = 0;
let emailViolations = 0;

for (const file of files) {
  if (forbiddenFile.test(file) && !allowedEnvironmentTemplate.test(file)) fileViolations += 1;
  if (/\.(?:png|jpe?g|gif|webp|zip|bundle|woff2?|ico)$/i.test(file)) continue;
  const buffer = await readFile(file);
  if (buffer.includes(0)) continue;
  const contents = buffer.toString("utf8");
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(contents)) valueViolations += 1;
  }
  emailPattern.lastIndex = 0;
  for (const match of contents.matchAll(emailPattern)) {
    if (!allowedEmailDomains.has(match[1].toLowerCase())) emailViolations += 1;
  }
}

if (fileViolations || valueViolations || emailViolations) {
  throw new Error(`Tracked secret scan failed (file=${fileViolations}, value=${valueViolations}, personal-email=${emailViolations}).`);
}
console.log(`Verified ${files.length} source candidates: no tracked .env, credential-shaped value, OAuth/JWT token, service credential, or personal email.`);
