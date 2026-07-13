import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: npm run version:set -- <semver> (for example, 0.2.0)");
  process.exit(1);
}

async function updateJson(path, update) {
  const document = JSON.parse(await readFile(path, "utf8"));
  update(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}

await updateJson("package.json", (document) => {
  document.version = version;
});

await updateJson("package-lock.json", (document) => {
  document.version = version;
  if (document.packages?.[""]) {
    document.packages[""].version = version;
  }
});

await updateJson("src-tauri/tauri.conf.json", (document) => {
  document.version = version;
});

const cargoPath = "src-tauri/Cargo.toml";
const cargo = await readFile(cargoPath, "utf8");
const cargoVersionPattern = /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m;

if (!cargoVersionPattern.test(cargo)) {
  throw new Error(`Could not update the package version in ${cargoPath}`);
}

const nextCargo = cargo.replace(cargoVersionPattern, `$1"${version}"`);
await writeFile(cargoPath, nextCargo);
console.log(`Helm version set to ${version}`);
