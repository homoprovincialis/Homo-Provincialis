'use strict';
// node --test tests/mobile-responsive-layout.test.cjs
// Requires Playwright, Chrome/Chromium and Git history containing main 51cc222.
// All application records are synthetic and confined to disposable browser contexts.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),SITE=path.join(ROOT,'homoprovincialis-site'),BASE='51cc222';
const PAGES=fs.readdirSync(SITE).filter(n=>n.endsWith('.html')).sort();
const WIDTHS=[320,375,390,768,1440],LANGS=['en','ru'];
const baseFile=name=>execFileSync('git',['show',`${BASE}:homoprovincialis-site/${name}`],{cwd:ROOT,maxBuffer:32*1024*1024});
function seed(){
 const member={id:'creator',name:'Ramon Eyquem',nameRu:'Ramon Eyquem',role:'autoritas',active:true};
 const state={current:'c',communities:[{id:'c',name:'Synthetic community',nameRu:'Тестовое сообщество',desc:'Synthetic only',descRu:'Только тест',ordinary:50,law:67,quorum:100,members:[member]}],cases:[],laws:[]};
 return {hp_direct_democracy_v6_safe:JSON.stringify({schemaVersion:6,state}),hp_open_online_library_v1:JSON.stringify({read:[{id:'book',original:'Original book',ru:'Русская книга',en:'English book',author:'Test author',year:'1900',rating:8}],queue:[]}),hp_translation_projects_v1:JSON.stringify({version:1,projects:[{id:'translation',title:'Translation project',author:'Test author',originalLang:'Bengali',originalUrl:'https://example.org/book',fragments:[{title:'Chapter 1',original:'Source text',ru:'Перевод',en:'Translation'}]}],selectedId:'translation'})};
}
async function ready(page,name){
 if(name==='world-direct-democracy-system.html')await page.waitForFunction(()=>document.querySelector('#app-title').textContent);
 if(name==='ramon-calendar.html')await page.waitForFunction(()=>document.querySelector('#month-year-en').options.length===13000);
}
async function layout(page){
 const issues=await page.evaluate(()=>{
  const width=document.documentElement.clientWidth;
  const outside=[...document.querySelectorAll('body *')].filter(e=>{
   const r=e.getBoundingClientRect(),s=getComputedStyle(e);
   // The calendar intentionally exposes the full seven-column table through its own scrollbar.
   return r.width&&r.height&&s.position!=='absolute'&&!e.closest('.month-calendar-scroll')&&(r.right>width+1||r.left < -1);
  }).map(e=>`${e.tagName}#${e.id}.${typeof e.className==='string'?e.className:''}`);
  const clipped=[...document.querySelectorAll('button,label,p,.book-meta,.book-original,.dd-text,.dd-case-title,.catalog-card')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+2).map(e=>e.id||e.className||e.tagName);
  return {width,scroll:document.documentElement.scrollWidth,outside,clipped};
 });
 assert.ok(issues.scroll<=issues.width+1,JSON.stringify(issues));
 assert.deepEqual(issues.outside,[],JSON.stringify(issues));
 assert.deepEqual(issues.clipped,[],JSON.stringify(issues));
}
async function downloadJSON(page,selector){const wait=page.waitForEvent('download');await page.locator(selector).click();const d=await wait;return JSON.parse(fs.readFileSync(await d.path(),'utf8'));}

// Compare every viewport-sized tile, avoiding one enormous calendar raster in memory.
async function screenshotTiles(page){
  await page.evaluate(()=>document.fonts.ready);
  const size=await page.evaluate(()=>({width:innerWidth,height:document.documentElement.scrollHeight,step:innerHeight}));
  const tiles=[];
  for(let top=0;top<size.height;top+=size.step){
    await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),top);
    const png=await page.screenshot({animations:'disabled'});
    tiles.push(createHash('sha256').update(png).digest('hex'));
  }
  return {...size,tiles};
}

test('Mobile layouts, desktop preservation and application workflows',async t=>{
 assert.equal(PAGES.length,20);
 const check=(name,fn)=>!process.env.MOBILE_CASE_PATTERN||new RegExp(process.env.MOBILE_CASE_PATTERN).test(name)?t.test(name,fn):Promise.resolve();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>browser.close());
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),target=path.resolve(SITE,name);if(!target.startsWith(SITE+path.sep)){res.writeHead(403).end();return;}fs.readFile(target,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}/`;
 async function open(width,lang,{before=false,long=false}={}){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  const data=seed();if(long){const book=JSON.parse(data.hp_open_online_library_v1);book.read[0].author='Author'+'x'.repeat(180);book.read[0].original='Original'+'y'.repeat(180);book.read[0].ru='Книга'+'я'.repeat(180);data.hp_open_online_library_v1=JSON.stringify(book);
   const project=JSON.parse(data.hp_translation_projects_v1);project.projects[0].title='Title'+'x'.repeat(180);project.projects[0].author='Author'+'x'.repeat(180);data.hp_translation_projects_v1=JSON.stringify(project);
   data.hp_translation_catalog_working_v1=JSON.stringify([{id:'published',title:'Title'+'x'.repeat(180),author:'Author'+'x'.repeat(180),originalLang:'Bengali',originalURL:'original.txt',ruURL:'ru.txt',enURL:'en.txt'}]);
   const democracy=JSON.parse(data.hp_direct_democracy_v6_safe);democracy.state.communities[0].members.push({id:'long-member',name:'Participant'+'x'.repeat(180),nameRu:'Участник'+'я'.repeat(180),role:'participant',active:true});data.hp_direct_democracy_v6_safe=JSON.stringify(democracy);
  }
  await context.addInitScript(({lang,data})=>{
   if(!sessionStorage.getItem('mobile-seed')){for(const[k,v]of Object.entries(data))localStorage.setItem(k,v);localStorage.setItem('hp-language',lang);sessionStorage.setItem('mobile-seed','1');}
   const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-10-23T00:00:00.000Z']));}static now(){return NativeDate.parse('2026-10-23T00:00:00.000Z');}};Math.random=()=>0.5;
  },{lang,data});
  if(before)await context.route(origin+'**',route=>{const name=new URL(route.request().url()).pathname.slice(1);try{return route.fulfill({body:baseFile(name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  async function go(name,protocol='http'){await page.goto(protocol==='file'?pathToFileURL(path.join(SITE,name)).href:origin+name);await ready(page,name);}
  return{context,page,go,errors};
 }
 async function run(width,lang,options,fn){const app=await open(width,lang,options);try{await fn(app);assert.deepEqual(app.errors,[]);}finally{await app.context.close();}}
 for(const lang of LANGS)if(!process.env.MOBILE_CASE_PATTERN||PAGES.some(name=>WIDTHS.some(width=>new RegExp(process.env.MOBILE_CASE_PATTERN).test(`${width}px ${lang}: ${name}`))))await run(320,lang,{},async({page,go})=>{
  for(const name of PAGES){
   if(process.env.MOBILE_CASE_PATTERN&&!WIDTHS.some(width=>new RegExp(process.env.MOBILE_CASE_PATTERN).test(`${width}px ${lang}: ${name}`)))continue;
   await go(name);
   for(const width of WIDTHS)await check(`${width}px ${lang}: ${name}`,async()=>{await page.setViewportSize({width,height:900});assert.equal(await page.locator('html').getAttribute('lang'),lang);await page.locator('details').evaluateAll(es=>es.forEach(e=>e.open=false));await layout(page);await page.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));await layout(page);});
  }
 });
 for(const lang of LANGS)if(!process.env.MOBILE_CASE_PATTERN||PAGES.some(name=>new RegExp(process.env.MOBILE_CASE_PATTERN).test(`1440px identical to main: ${name} ${lang}`))){
  const apps=[await open(1440,lang,{before:true}),await open(1440,lang)];
  try{for(const name of PAGES)await check(`1440px identical to main: ${name} ${lang}`,async()=>{
   const images=[];for(const {page,go}of apps){await go(name);images.push(await screenshotTiles(page));}assert.deepEqual(images[0],images[1]);
  });for(const app of apps)assert.deepEqual(app.errors,[]);}finally{for(const app of apps)await app.context.close();}
 }
 for(const width of WIDTHS.filter(w=>w<1440))for(const lang of LANGS){
  await check(`${width}px ${lang}: calendar conversion, scrollable month and day selection`,()=>run(width,lang,{},async({page,go})=>{
   await go('ramon-calendar.html');await page.locator('#ramon-date-'+lang).fill('2000-03-20');await page.locator('#ramon-time-'+lang).fill('07:35');await page.locator('#ramon-offset-'+lang).fill('0');await page.locator('#ramon-convert-'+lang).click();assert.equal(await page.locator('#ramon-year-'+lang).textContent(),'12000');await layout(page);
   const heading=await page.locator('#month-heading-'+lang).textContent();await page.locator('#month-next-'+lang).click();assert.notEqual(await page.locator('#month-heading-'+lang).textContent(),heading);await page.locator('#month-prev-'+lang).click();assert.equal(await page.locator('#month-heading-'+lang).textContent(),heading);
   const scroll=page.locator('.month-calendar-scroll:visible');if(width<=700){assert.ok(await scroll.evaluate(e=>e.scrollWidth>e.clientWidth));await scroll.evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await scroll.evaluate(e=>e.scrollLeft>0));}
   await page.locator(`#month-body-${lang} td.day-cell`).first().click();await layout(page);
  }));
  await check(`${width}px ${lang}: library add/edit/search/export/import and long metadata`,()=>run(width,lang,{long:true},async({page,go})=>{
   await go('open-online-library.html');await layout(page);await page.locator('#add-read').click();await layout(page);await page.locator('#read-original').fill('Mobile test book');await page.locator('#read-rating').selectOption('8');await page.locator('#save-read').click();await page.locator('#catalog-search').fill('Mobile test');assert.equal(await page.locator('#read-list .book').count(),1);await page.locator('#read-list [data-a="edit"]').click();await page.locator('#read-author').fill('Mobile author');await page.locator('#save-read').click();await layout(page);const exported=await downloadJSON(page,'#export-json');assert.equal(exported.read.length,2);await page.locator('#import-json').setInputFiles({name:'mobile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('hp_open_online_library_v1'))),exported);await page.reload();await page.locator('#catalog-search').fill('Mobile test');assert.equal(await page.locator('#read-list .book').count(),1);await layout(page);
  }));
  await check(`${width}px ${lang}: translation editors, metadata, catalogue and persisted draft`,()=>run(width,lang,{},async({page,go})=>{
   await go('book-translation-environment.html');await page.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));await layout(page);await page.locator('#ru').fill('Мобильный перевод');await page.locator('#en').fill('Mobile translation');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hp_translation_projects_v1')).projects[0].fragments[0].en==='Mobile translation');await page.reload();assert.equal(await page.locator('#ru').inputValue(),'Мобильный перевод');assert.equal(await page.locator('#en').inputValue(),'Mobile translation');await layout(page);
  }));
  await check(`${width}px ${lang}: democracy member, proposal, vote, reload and JSON backup`,()=>run(width,lang,{},async({page,go})=>{
   await go('world-direct-democracy-system.html');await page.locator('#member-name').fill('Mobile participant');await page.locator('#add-member').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hp_direct_democracy_v6_safe')).state.communities[0].members.length===2);await layout(page);
   await page.locator('[data-tab="case"]').click();await page.locator('#case-title').fill('Mobile proposal');await page.locator('#case-text').fill('Synthetic mobile proposal');await page.locator('#open-case').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hp_direct_democracy_v6_safe')).state.cases.length===1);await page.locator('[data-tab="vote"]').click();await layout(page);
   await page.locator('button[data-v="yes"]').first().click();await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('hp_direct_democracy_v6_safe')).state.cases[0].votes).length===1);await page.reload();await ready(page,'world-direct-democracy-system.html');await page.locator('[data-tab="data"]').click();await layout(page);const exported=await downloadJSON(page,'#export-json');await page.locator('#import-json').setInputFiles({name:'democracy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await page.waitForFunction(()=>document.querySelector('#p-community').classList.contains('active')&&!document.querySelector('#import-json').disabled);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('hp_direct_democracy_v6_safe')).state),exported);await layout(page);assert.equal(await page.locator('#s-members').textContent(),'2');
  }));
  await check(`${width}px ${lang}: morality answers, explanation and reload`,()=>run(width,lang,{},async({page,go})=>{await go('check-your-morality.html');await page.locator('#start-btn').click();await layout(page);await page.locator('.answer input').first().check();await page.locator('#reason').fill('Mobile reasoning');await page.reload();await page.locator('#start-btn').click();await layout(page);assert.equal(await page.locator('.answer input').first().isChecked(),true);assert.equal(await page.locator('#reason').inputValue(),'Mobile reasoning');}));
 }
 for(const width of [320,768])for(const lang of LANGS)for(const name of ['book-translation-environment.html','world-direct-democracy-system.html'])await check(`${width}px ${lang}: long records ${name}`,()=>run(width,lang,{long:true},async({page,go})=>{await go(name);await page.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));await layout(page);}));
 for(const lang of LANGS)await check(`file:// 320px ${lang}: all pages, language controls and reload`,()=>run(320,lang,{},async({page,go})=>{for(const name of PAGES){await go(name,'file');await layout(page);await page.evaluate(()=>HPLanguage.set(document.documentElement.lang==='en'?'ru':'en'));await page.reload();await ready(page,name);await layout(page);}}));
 await check('Only CSS changed in application sources; scripts, text, navigation and data are preserved',()=>{
  const stripStyles=b=>b.toString().replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  for(const name of PAGES)assert.equal(stripStyles(fs.readFileSync(path.join(SITE,name))),stripStyles(baseFile(name)),name);
  for(const name of ['js/language.js','js/democracy-storage.js','documents/open-online-library-backup.json'])assert.deepEqual(fs.readFileSync(path.join(SITE,name)),baseFile(name),name);
 });
});
