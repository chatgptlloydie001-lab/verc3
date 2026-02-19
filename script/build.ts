import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

const ANTI_DEBUG_SCRIPT = `<script>(function(){var _0x={};_0x.a=function(){try{(function(){return false;}).constructor('debugger')();}catch(_){}};_0x.b=setInterval(function(){_0x.a();},50);document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&(e.key==='I'||e.key==='J'||e.key==='C'))||(e.ctrlKey&&e.key==='u')){e.preventDefault();e.stopPropagation();return false;}});document.addEventListener('contextmenu',function(e){e.preventDefault();return false;});})();</script>`;

async function getJsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getJsFiles(full)));
      } else if (entry.name.endsWith(".js")) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

async function obfuscateAndProtect() {
  const distPublic = path.resolve("dist/public");

  console.log("post-build: obfuscating JS files...");
  const jsFiles = await getJsFiles(path.join(distPublic, "assets"));
  for (const file of jsFiles) {
    const code = await readFile(file, "utf-8");
    const name = path.basename(file);
    console.log(`  obfuscating ${name} (${(code.length / 1024).toFixed(1)}KB)...`);
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
    } catch (err: any) {
      console.error(`  WARN: could not obfuscate ${name}: ${err.message}`);
    }
  }

  console.log("post-build: removing source maps & injecting anti-debug...");
  async function cleanDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await cleanDir(full);
        } else if (entry.name.endsWith(".map")) {
          await rm(full);
        } else if (entry.name.endsWith(".js") || entry.name.endsWith(".css")) {
          let c = await readFile(full, "utf-8");
          const cleaned = c.replace(/\/[/*]#\s*sourceMappingURL=.*$/gm, "");
          if (cleaned !== c) await writeFile(full, cleaned);
        }
      }
    } catch {}
  }
  await cleanDir(distPublic);

  const indexPath = path.join(distPublic, "index.html");
  let html = await readFile(indexPath, "utf-8");
  html = html.replace("<head>", "<head>" + ANTI_DEBUG_SCRIPT);
  await writeFile(indexPath, html);

  console.log("post-build: security hardening complete!");
}

buildAll()
  .then(() => obfuscateAndProtect())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
