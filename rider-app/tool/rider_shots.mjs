import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http'; import fs from 'fs'; import path from 'path';
const [buildDir, outDir, label='rider'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.otf':'font/otf','.ttf':'font/ttf','.ico':'image/x-icon','.map':'application/json','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(buildDir,u);fs.readFile(f,(e,d)=>{if(e){fs.readFile(path.join(buildDir,'index.html'),(e2,idx)=>{if(e2){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':'text/html'});res.end(idx);});return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
const W=412,H=892; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 await new Promise(r=>server.listen(0,r)); const port=server.address().port; const base=`http://127.0.0.1:${port}/`;
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.route('**/*',(route)=>{const url=route.request().url();const m=url.match(/flutter-canvaskit\/[^/]+\/(.*)$/);if(m){const local=path.join(buildDir,'canvaskit',m[1]);if(fs.existsSync(local)){const ct=url.endsWith('.wasm')?'application/wasm':'text/javascript';return route.fulfill({status:200,contentType:ct,body:fs.readFileSync(local)});}}return route.continue();});
 async function ready(){for(let i=0;i<60;i++){const ok=await page.evaluate(()=>{const c=document.querySelector('flt-scene-host canvas, flutter-view canvas, canvas');return !!c&&c.width>0&&c.height>0;});if(ok)break;await wait(500);}await wait(3500);}
 async function reload(){await page.goto(base,{waitUntil:'load'});await ready();}
 async function shot(n){await wait(1500);const p=path.join(outDir,`${label}-${n}.png`);await page.screenshot({path:p});console.log('captured',p);}
 async function tap(x,y){await page.mouse.click(x,y);await wait(1500);}
 const navY=842;
 // Flow 1: Tasks + task detail
 await reload();
 await shot('01-tasks');
 await tap(206, 360);           // first task card -> bottom sheet
 await shot('02-task-detail');
 // Flow 2: Navigate / Earnings / Profile
 await reload(); await tap(171, navY); await shot('03-navigate');
 await reload(); await tap(257, navY); await shot('04-earnings');
 await reload(); await tap(343, navY); await shot('05-profile');
 await b.close(); server.close(); console.log('done');
}
main().catch(e=>{console.error(e);process.exit(1);});
