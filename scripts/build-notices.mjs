import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Browser dependencies, including dynamically loaded installer and schema code.
const packages = [
  "astro",
  "@astrojs/react",
  "react",
  "react-dom",
  "scheduler",
  "ajv",
  "fast-deep-equal",
  "fast-uri",
  "json-schema-traverse",
  "require-from-string",
  "esptool-js",
  "pako",
  "atob-lite",
  "crypto-js",
];
const output = ["KajLights website browser dependency notices", ""];
for (const name of packages) {
  const directory = path.resolve("node_modules", name),
    info = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
  const names = (await readdir(directory))
    .filter((file) =>
      /^(LICENSE|LICENCE|NOTICE|COPYING)(?:[.-].*)?$/i.test(file),
    )
    .sort();
  if (!names.length) throw Error("Missing browser dependency license: " + name);
  output.push(`${name}@${info.version} (${info.license})`, "=".repeat(72));
  for (const file of names)
    output.push(file, await readFile(path.join(directory, file), "utf8"));
}
await mkdir("public/notices", { recursive: true });
await writeFile(
  "public/notices/browser-dependencies.txt",
  output.join("\n") + "\n",
);
