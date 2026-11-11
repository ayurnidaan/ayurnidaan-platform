import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const excludedDirectories = new Set([
  '.git', '.expo', '.gradle', '.tmp-live-function-check', '.vercel',
  'build', 'dist', 'dist-vikriti', 'node_modules', 'security-web-export', 'tmp',
]);
function listFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(path));
    else output.push(relative('.', path).replaceAll('\\', '/'));
  }
  return output;
}
const files = listFiles('.').filter((path) => !/(^|\/)\.env(?:\.|$)/.test(path));

const textFiles = [];
for (const path of files) {
  try {
    const buffer = readFileSync(path);
    if (buffer.length <= 5 * 1024 * 1024 && !buffer.includes(0)) textFiles.push([path, buffer.toString('utf8')]);
  } catch {
    // A concurrently generated file can disappear between listing and reading.
  }
}
const worktreeText = textFiles.map(([, content]) => content).join('\n');

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /\b(?:sk_live_|rk_live_|whsec_)[A-Za-z0-9_-]{16,}\b/,
  /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{24,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
];

const envSecrets = [];
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || /^(?:EXPO_PUBLIC_|SUPABASE_ANON_KEY$)/.test(match[1])) continue;
    if (!/(?:SECRET|TOKEN|SERVICE_ROLE|PRIVATE|PASSWORD|SIGNING)/.test(match[1])) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (value.length >= 12) envSecrets.push([match[1], value]);
  }
}

const failures = [];
if (secretPatterns.some((pattern) => pattern.test(worktreeText))) failures.push('high-confidence secret pattern in repository worktree');
for (const [name, value] of envSecrets) {
  if (worktreeText.includes(value)) failures.push(`${name} exact value in repository worktree`);
}

const aadhaarValue = /(?<![A-Za-z0-9])\d{12}(?![A-Za-z0-9])/.test(worktreeText);
const panValue = /\b[A-Z]{5}\d{4}[A-Z]\b/.test(worktreeText);
if (aadhaarValue) failures.push('12-digit Aadhaar-shaped value in repository text');
if (panValue) failures.push('PAN-shaped value in repository text');

const publicDoctorProfiles = textFiles
  .filter(([path]) => path === 'App.tsx')
  .flatMap(([, content]) => content.match(/portrait: require\('\.\/doc-dp\//g) ?? []).length;

console.log(`${failures.length ? 'FAIL' : 'PASS'}  repository worktree secret scan`);
console.log(`${aadhaarValue || panValue ? 'FAIL' : 'PASS'}  no Aadhaar or PAN values in repository text`);
console.log(`PASS  configured sensitive environment values are absent from repository text`);
console.log(`INFO  intentionally public practitioner profiles bundled: ${publicDoctorProfiles}`);
if (failures.length) {
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  process.exitCode = 1;
}
