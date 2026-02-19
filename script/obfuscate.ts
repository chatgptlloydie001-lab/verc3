import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

const DIST_PUBLIC = path.resolve("dist/public/assets");

async function getJsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getJsFiles(full)));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

async function obfuscateFiles() {
  console.log("Obfuscating production JS files...");

  const jsFiles = await getJsFiles(DIST_PUBLIC);
  console.log(`Found ${jsFiles.length} JS files to obfuscate`);

  for (const file of jsFiles) {
    const code = await readFile(file, "utf-8");
    const fileName = path.basename(file);

    console.log(`  Obfuscating ${fileName} (${(code.length / 1024).toFixed(1)}KB)...`);

    try {
      const result = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: true,
        debugProtectionInterval: 2000,
        disableConsoleOutput: true,
        identifierNamesGenerator: "hexadecimal",
        renameGlobals: false,
        selfDefending: true,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayEncoding: ["base64"],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersType: "function",
        stringArrayThreshold: 0.75,
        splitStrings: true,
        splitStringsChunkLength: 10,
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
        target: "browser",
      });

      await writeFile(file, result.getObfuscatedCode());
      console.log(`  Done: ${fileName}`);
    } catch (err: any) {
      console.error(`  Failed to obfuscate ${fileName}: ${err.message}`);
    }
  }

  console.log("Obfuscation complete!");
}

obfuscateFiles().catch((err) => {
  console.error("Obfuscation failed:", err);
  process.exit(1);
});
