import fs from "node:fs";
import path from "node:path";

type PersonaRegistryV0 = {
  version: 0;
  personas: Array<{
    id: string;
    auth_env_path?: string;
  }>;
};

type SeedSecretsV0 = {
  version: 0;
  personas: Record<string, { email: string; password: string }>;
};

function die(msg: string): never {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(1);
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function main() {
  const registryPath = process.argv[2] || path.join("seed", "persona_registry_v0.json");
  const outPath = process.argv[3] || path.join("seed", "secrets.local.json");

  if (!fs.existsSync(registryPath)) die(`persona registry not found: ${registryPath}`);
  const reg = JSON.parse(fs.readFileSync(registryPath, "utf8")) as PersonaRegistryV0;
  if (!reg || reg.version !== 0 || !Array.isArray(reg.personas)) die("persona registry must be version 0 with personas[]");

  const personas: SeedSecretsV0["personas"] = {};
  const missing: string[] = [];

  for (const p of reg.personas) {
    const envPath = String(p.auth_env_path || "").trim();
    if (!envPath) continue;
    if (!fs.existsSync(envPath)) {
      missing.push(`${p.id} (missing env file: ${envPath})`);
      continue;
    }
    const vars = readEnvFile(envPath);
    const email = String(vars.SEED_USER_EMAIL || "").trim();
    const password = String(vars.SEED_USER_PASSWORD || "").trim();
    if (!email || !password) {
      missing.push(`${p.id} (missing SEED_USER_EMAIL/SEED_USER_PASSWORD in ${envPath})`);
      continue;
    }
    personas[p.id] = { email, password };
  }

  if (missing.length) {
    die(["Cannot migrate, missing persona env data:", ...missing.map((m) => `- ${m}`)].join("\n"));
  }

  const out: SeedSecretsV0 = { version: 0, personas };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote secrets json: ${outPath}\n`);
  process.stdout.write(`Personas included: ${Object.keys(personas).length}\n`);
}

main();

