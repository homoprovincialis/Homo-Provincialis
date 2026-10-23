'use strict';
// node --test tests/unified-language.test.cjs
// Requires Playwright + Chrome/Chromium and Git history containing base main 11ec133.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),SITE=path.join(ROOT,'homoprovincialis-site');
const PAGES=fs.readdirSync(SITE).filter(name=>name.endsWith('.html')).sort();
const KEY='hp-language',BASE='11ec133';
const LEGACY=['homoprovincialis-language','hp_translation_ui_lang_v1','language','lang','siteLanguage'];
const CUSTOM=['universal-philosophical-language.html','book-translation-environment.html','open-online-library.html','check-your-philosophy.html','check-your-morality.html','world-direct-democracy-system.html'];
function baseFile(name){return execFileSync('git',['show',`${BASE}:homoprovincialis-site/${name}`],{cwd:ROOT,encoding:'utf8'});}
function seedData(){
  const member={id:'creator',name:'Ramon Eyquem',nameRu:'Ramon Eyquem',role:'autoritas',active:true};
  const community={id:'community',name:'Preserved community',nameRu:'Сохранённое сообщество',desc:'Preserved description',descRu:'Сохранённое описание',ordinary:55,law:70,quorum:80,members:[member,{id:'participant',name:'Test participant',nameRu:'Тестовый участник',role:'participant',active:true}]};
  const democracy={current:'community',communities:[community],cases:[{id:'case',communityId:'community',type:'proposal',initiator:'creator',target:null,title:'Existing proposal',text:'Existing text',threshold:55,quorum:80,votes:{creator:'yes',participant:'abstain'},status:'open',createdAt:'2026-10-01T00:00:00.000Z'}],laws:[{id:'decision',communityId:'community',type:'law',title:'Existing decision',text:'Existing law',status:'passed',finalizedAt:'2026-10-02T00:00:00.000Z',threshold:70,votes:{yes:2,no:0,abstain:0,eligible:2}}]};
  return {
    hp_open_online_library_v1:JSON.stringify({read:[{id:'book',original:'Original book',ru:'Русская книга',en:'English book',author:'Author',year:'1900',rating:8}],queue:[]}),
    hp_translation_projects_v1:JSON.stringify({version:1,projects:[{id:'translation',title:'Translation project',author:'Author',originalLang:'Bengali',originalUrl:'https://example.org/book',fragments:[{title:'Chapter 1',original:'Original source',ru:'Сохранённый перевод',en:'Saved translation'}]}],selectedId:'translation'}),
    hp_translation_catalog_working_v1:JSON.stringify([{id:'published',title:'Published book',author:'Author',originalLang:'Bengali',originalURL:'original.txt',ruURL:'ru.txt',enURL:'en.txt'}]),
    'homo-morality-v3':JSON.stringify({answers:Array.from({length:40},(_,i)=>i===0?[1]:[]),reasons:Array.from({length:40},(_,i)=>i===0?'Saved reasoning':''),current:0,view:'intro',contentRevision:30}),
    hp_direct_democracy_v6_safe:JSON.stringify({schemaVersion:6,state:democracy}),
    unrelated_settings:JSON.stringify({keep:'unchanged'})
  };
}
const SELECTORS={
  'open-online-library.html':l=>`[data-language="${l}"]`,
  'check-your-philosophy.html':l=>`[data-language="${l}"]`,
  'check-your-morality.html':l=>`[data-lang="${l}"]`,
  'universal-philosophical-language.html':l=>`[data-choice="${l}"]`,
  'book-translation-environment.html':l=>l==='ru'?'#switchRu':'#switchEn',
  'world-direct-democracy-system.html':l=>`button[onclick="ddLanguage('${l}')"]`
};
function switchSelector(name,lang){return SELECTORS[name]?SELECTORS[name](lang):`button[onclick="setLanguage('${lang}')"]`;}
async function ready(page,name){
  await page.waitForFunction(()=>document.readyState==='complete');
  if(name==='world-direct-democracy-system.html')await page.waitForFunction(()=>typeof ddLanguage==='function'&&document.getElementById('app-title').textContent);
  if(name==='ramon-calendar.html')await page.waitForFunction(()=>document.getElementById('month-year-en').options.length===13000);
}
async function activeLanguage(page,name,lang){
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  const selected=page.locator(switchSelector(name,lang));assert.equal(await selected.getAttribute('aria-pressed'),'true');
  if(name==='book-translation-environment.html'){
    assert.equal(await page.locator('[data-i18n="title"]').textContent(),lang==='ru'?'Среда перевода книг':'Book Translation Environment');
  }else if(name==='open-online-library.html'){
    assert.equal(await page.locator('#app-title').textContent(),lang==='ru'?'Открытая онлайн-библиотека':'Open Online Library');
  }else if(name==='world-direct-democracy-system.html'){
    assert.equal(await page.locator('#app-title').textContent(),lang==='ru'?'Инструмент прямой демократии':'Direct Democracy Tool');
    assert.equal(await page.locator(`.lang-${lang}`).first().isVisible(),true);
  }else if(name==='check-your-morality.html'){
    assert.match(await page.locator('#start-btn').textContent(),lang==='ru'?/Продолжить|Начать/:/Continue|Start/);
  }else if(name==='check-your-philosophy.html'){
    assert.equal(await page.locator(`[data-page-lang="${lang}"]`).isVisible(),true);
    assert.equal(await page.locator(`[data-page-lang="${lang==='en'?'ru':'en'}"]`).isVisible(),false);
  }else{
    assert.equal(await page.locator(`.lang-${lang}`).first().isVisible(),true);
    assert.equal(await page.locator(`.lang-${lang==='en'?'ru':'en'}`).first().isVisible(),false);
  }
}

test('Unified RU/EN preference across all 20 pages',async t=>{
  assert.equal(PAGES.length,20);
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(()=>browser.close());
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const target=path.resolve(SITE,'.'+pathname);
    if(!target.startsWith(SITE+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(target,(error,body)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(body);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}/`;
  async function open(preferences={},options={}){
    const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
    const data={...seedData(),...preferences};
    await context.addInitScript(({data,denied,fixed})=>{
      if(!sessionStorage.getItem('language-test-seeded')){
        for(const [key,value]of Object.entries(data))localStorage.setItem(key,value);
        sessionStorage.setItem('language-test-seeded','1');
      }
      const nativeSet=Storage.prototype.setItem,nativeGet=Storage.prototype.getItem;
      window.__languageWrites=[];
      Storage.prototype.setItem=function(key,value){
        if(denied&&['hp-language','homoprovincialis-language','hp_translation_ui_lang_v1','language','lang','siteLanguage'].includes(key))throw new DOMException('Unavailable','SecurityError');
        window.__languageWrites.push([key,String(value)]);return nativeSet.call(this,key,value);
      };
      if(denied)Storage.prototype.getItem=function(key){
        if(['hp-language','homoprovincialis-language','hp_translation_ui_lang_v1','language','lang','siteLanguage'].includes(key))throw new DOMException('Unavailable','SecurityError');
        return nativeGet.call(this,key);
      };
      if(fixed){const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-23T00:00:00.000Z']));}static now(){return NativeDate.parse('2026-10-23T00:00:00.000Z');}};Math.random=()=>0.5;}
    },{data,denied:options.denied,fixed:options.fixed});
    if(options.before){
      for(const name of [...PAGES,'js/language.js'])await context.route(origin+name,route=>route.fulfill({body:baseFile(name),contentType:name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'}));
    }
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    async function go(name,protocol='http'){await page.goto(protocol==='file'?pathToFileURL(path.join(SITE,name)).href:origin+name);await ready(page,name);}
    return {context,page,errors,go,data};
  }
  async function run(preferences,options,fn){const app=await open(preferences,options);try{await fn(app);assert.deepEqual(app.errors,[]);}finally{await app.context.close();}}
  await t.test('All 20 pages retain markup, CSS, navigation, translations and application dictionaries',()=>{
    const stripScripts=value=>value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/>\s+</g,'><').trim();
    for(const name of PAGES){
      const before=baseFile(name),after=fs.readFileSync(path.join(SITE,name),'utf8');
      assert.equal(stripScripts(after),stripScripts(before),name);
      assert.equal((after.match(/src="js\/language.js"/g)||[]).length,1,name);
      const json=value=>[...value.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
      assert.deepEqual(json(after),json(before),name+' JSON records');
      let markers;
      if(name==='book-translation-environment.html')markers=['const dict=','const $='];
      if(name==='open-online-library.html')markers=['const T=',';let lang='];
      if(name==='check-your-morality.html')markers=['const L=','const KEY='];
      if(name==='world-direct-democracy-system.html')markers=['const L=','const t='];
      if(markers){const extract=value=>value.slice(value.indexOf(markers[0]),value.indexOf(markers[1],value.indexOf(markers[0])));assert.equal(extract(after),extract(before),name+' dictionary');}
      if(!CUSTOM.includes(name))assert.equal(after,before,name+' untouched HTML');
    }
  });
  for(const name of PAGES)await t.test(`${name}: first visit EN, RU/EN controls and reload`,()=>run({}, {},async app=>{
    await app.go(name);await activeLanguage(app.page,name,'en');
    assert.equal(await app.page.evaluate(()=>localStorage.getItem('hp-language')),null,'Default is not saved as a user selection');
    for(const lang of ['ru','en']){
      await app.page.locator(switchSelector(name,lang)).click();await activeLanguage(app.page,name,lang);
      assert.equal(await app.page.evaluate(()=>localStorage.getItem('hp-language')),lang);
      await app.page.reload();await ready(app.page,name);await activeLanguage(app.page,name,lang);
    }
  }));
  for(const protocol of ['http','file'])for(const lang of ['ru','en'])await t.test(`${protocol}: ${lang} survives navigation through all 20 pages`,()=>run({}, {},async app=>{
    await app.go('index.html',protocol);await app.page.locator(switchSelector('index.html',lang)).click();
    for(const name of PAGES){await app.go(name,protocol);await activeLanguage(app.page,name,lang);}
    const home=app.page.locator(`a[href="index.html"]:visible`).first();await home.click();await ready(app.page,'index.html');await activeLanguage(app.page,'index.html',lang);
  }));
  for(const lang of ['ru','en'])await t.test(`actual site links retain ${lang} across applications`,()=>run({}, {},async app=>{
    await app.go('index.html');await app.page.locator(switchSelector('index.html',lang)).click();
    for(const name of CUSTOM.filter(name=>name!=='check-your-morality.html')){
      await app.page.locator(`a[href="${name}"]:visible`).click();await ready(app.page,name);await activeLanguage(app.page,name,lang);
      if(name==='check-your-philosophy.html'){
        await app.page.locator('a[href="check-your-morality.html"]:visible').click();await ready(app.page,'check-your-morality.html');await activeLanguage(app.page,'check-your-morality.html',lang);
      }
      await app.page.locator('a[href="index.html"]:visible').first().click();await ready(app.page,'index.html');await activeLanguage(app.page,'index.html',lang);
    }
  }));
  for(const key of [KEY,...LEGACY])await t.test(`read-only compatibility: ${key}`,()=>run({[key]:'ru'}, {},async app=>{
    for(const name of ['index.html',...CUSTOM]){await app.go(name);await activeLanguage(app.page,name,'ru');assert.equal(await app.page.evaluate(k=>localStorage.getItem(k),key),'ru');}
    assert.equal(await app.page.evaluate(()=>window.__languageWrites.some(([key])=>key==='hp-language')),false);
  }));
  await t.test('canonical key takes precedence; invalid preferences default to EN',async()=>{
    await run({[KEY]:'en',...Object.fromEntries(LEGACY.map(key=>[key,'ru']))},{},async app=>{await app.go('check-your-morality.html');await activeLanguage(app.page,'check-your-morality.html','en');});
    await run(Object.fromEntries([KEY,...LEGACY].map(key=>[key,'invalid'])),{},async app=>{await app.go('index.html');await activeLanguage(app.page,'index.html','en');await app.page.evaluate(()=>HPLanguage.set('xx'));assert.equal(await app.page.locator('html').getAttribute('lang'),'en');assert.equal(await app.page.evaluate(()=>localStorage.getItem('hp-language')),'invalid');});
  });
  for(const name of ['index.html',...CUSTOM])await t.test(`${name}: unavailable language storage does not break switching`,()=>run({}, {denied:true},async app=>{
    await app.go(name);await activeLanguage(app.page,name,'en');await app.page.locator(switchSelector(name,'ru')).click();await activeLanguage(app.page,name,'ru');
  }));
  for(const name of CUSTOM)await t.test(`${name}: language changes preserve all application data and old preferences`,()=>run(Object.fromEntries(LEGACY.map(key=>[key,'en'])),{},async app=>{
    await app.go(name);
    if(name==='check-your-morality.html')await app.page.locator('#start-btn').click();
    if(name==='book-translation-environment.html'){await app.page.locator('#ru').fill('Editor text / Текст редактора');await app.page.waitForFunction(()=>JSON.parse(localStorage.getItem('hp_translation_projects_v1')).projects[0].fragments[0].ru==='Editor text / Текст редактора');}
    const before=await app.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='hp-language')));
    await app.page.evaluate(()=>window.__languageWrites=[]);
    for(const lang of ['ru','en']){await app.page.locator(switchSelector(name,lang)).click();assert.equal(await app.page.locator('html').getAttribute('lang'),lang);}
    const after=await app.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='hp-language')));
    assert.deepEqual(after,before);
    assert.deepEqual(await app.page.evaluate(()=>window.__languageWrites.map(([key])=>key)),[KEY,KEY]);
    if(name==='book-translation-environment.html')assert.equal(await app.page.locator('#ru').inputValue(),'Editor text / Текст редактора');
    if(name==='check-your-morality.html'){assert.equal(await app.page.locator('#answer-list input:checked').count(),1);assert.equal(await app.page.locator('#reason').inputValue(),'Saved reasoning');}
  }));
  await t.test('calendar conversion and month controls work in both languages',()=>run({}, {},async app=>{
    await app.go('ramon-calendar.html');
    for(const lang of ['ru','en']){
      await app.page.locator(switchSelector('ramon-calendar.html',lang)).click();await app.page.locator('#ramon-date-'+lang).fill('2000-03-20');await app.page.locator('#ramon-time-'+lang).fill('07:35');await app.page.locator('#ramon-offset-'+lang).fill('0');await app.page.locator('#ramon-convert-'+lang).click();
      assert.equal(await app.page.locator('#ramon-year-'+lang).textContent(),'12000');assert.equal(await app.page.locator('#ramon-day-'+lang).textContent(),'1');
      await app.page.locator('#month-year-'+lang).selectOption('12026');await app.page.locator('#month-month-'+lang).selectOption('1');await app.page.locator('#month-show-'+lang).click();assert.match(await app.page.locator('#month-selected-'+lang).textContent(),/12026/);
    }
  }));
  await t.test('choice synchronizes another open page without writing application data',()=>run({}, {},async app=>{
    await app.go('index.html');const second=await app.context.newPage();await second.goto(origin+'check-your-philosophy.html');await ready(second,'check-your-philosophy.html');
    await app.page.locator(switchSelector('index.html','ru')).click();await second.waitForFunction(()=>document.documentElement.lang==='ru');await activeLanguage(second,'check-your-philosophy.html','ru');
  }));
  for(const name of ['index.html','ramon-calendar.html',...CUSTOM])for(const lang of ['en','ru'])await t.test(`unchanged design: ${name} ${lang}`,async()=>{
    const images=[];for(const before of [true,false]){
      const app=await open({[KEY]:lang,...Object.fromEntries(LEGACY.map(key=>[key,lang]))},{before,fixed:true});
      try{await app.go(name);await app.page.locator(switchSelector(name,lang)).click();images.push(await app.page.screenshot({fullPage:true,animations:'disabled'}));}finally{await app.context.close();}
    }
    assert.deepEqual(images[0],images[1]);
  });
});


test('Delayed language storage events cannot override the latest saved choice',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const context=await browser.newContext();const page=await context.newPage();
    await page.context().route('http://preference.test/**',route=>{
      const shared=new URL(route.request().url()).pathname==='/js/language.js';
      return route.fulfill({contentType:shared?'text/javascript':'text/html; charset=utf-8',body:fs.readFileSync(path.join(SITE,shared?'js/language.js':'index.html'))});
    });
    await page.goto('http://preference.test/index.html');
    await page.evaluate(()=>{
      HPLanguage.set('en');
      window.dispatchEvent(new StorageEvent('storage',{key:'hp-language',oldValue:'en',newValue:'ru',storageArea:localStorage}));
    });
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hp-language')),'en');
    const second=await page.context().newPage();await second.goto('http://preference.test/index.html');
    await second.locator("button[onclick=\"setLanguage('ru')\"]").click();
    await page.waitForFunction(()=>document.documentElement.lang==='ru');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hp-language')),'ru');
    assert.equal(await page.locator("button[onclick=\"setLanguage('ru')\"]").getAttribute('aria-pressed'),'true');
  }finally{await browser.close();}
});
