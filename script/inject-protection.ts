import { readFile, writeFile, rm, readdir } from "fs/promises";
import path from "path";

const DIST_PUBLIC = path.resolve("dist/public");

const ANTI_DEBUG_SCRIPT = `<script>
(function(){
var _0x={};
_0x.a=function(){try{(function(){return false;})
.constructor('debugger')();
}catch(_){}};
_0x.b=setInterval(function(){_0x.a();},50);
var _d=new Date();
_0x.c=function(){
var _n=new Date();
if(_n.getTime()-_d.getTime()>100){
document.documentElement.innerHTML='';
window.location.reload();
}
_d=_n;
};
document.addEventListener('keydown',function(e){
if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&(e.key==='I'||e.key==='J'||e.key==='C'))||(e.ctrlKey&&e.key==='u')){
e.preventDefault();e.stopPropagation();return false;}
});
document.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
var _ck=function(){
var _el=new Image();
Object.defineProperty(_el,'id',{get:function(){
document.documentElement.innerHTML='';
window.location.href='/';
}});
};
setInterval(_ck,1000);
})();
</script>`;

async function removeSourceMaps(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeSourceMaps(full);
    } else if (entry.name.endsWith(".map")) {
      await rm(full);
      console.log(`  Removed source map: ${entry.name}`);
    }
  }
}

async function stripSourceMapRefs(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await stripSourceMapRefs(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".css")) {
      let content = await readFile(full, "utf-8");
      const cleaned = content.replace(/\/[/*]#\s*sourceMappingURL=.*$/gm, "");
      if (cleaned !== content) {
        await writeFile(full, cleaned);
        console.log(`  Stripped source map ref from: ${entry.name}`);
      }
    }
  }
}

async function injectProtection() {
  console.log("Injecting anti-debug protection...");

  const indexPath = path.join(DIST_PUBLIC, "index.html");
  let html = await readFile(indexPath, "utf-8");

  html = html.replace("<head>", "<head>" + ANTI_DEBUG_SCRIPT);

  await writeFile(indexPath, html);
  console.log("  Injected anti-debug script into index.html");

  console.log("Removing source maps...");
  await removeSourceMaps(DIST_PUBLIC);

  console.log("Stripping source map references...");
  await stripSourceMapRefs(DIST_PUBLIC);

  console.log("Protection injection complete!");
}

injectProtection().catch((err) => {
  console.error("Protection injection failed:", err);
  process.exit(1);
});
