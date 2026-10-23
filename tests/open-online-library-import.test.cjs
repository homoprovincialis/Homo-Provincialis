'use strict';

// Run with: node --test tests/open-online-library-import.test.cjs
// Requires Playwright and Chromium; override CHROMIUM_EXECUTABLE_PATH if needed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const html=fs.readFileSync(path.join(__dirname,'../homoprovincialis-site/open-online-library.html'),'utf8');
const backup=JSON.parse(fs.readFileSync(path.join(__dirname,'../homoprovincialis-site/documents/open-online-library-backup.json'),'utf8'));
const KEY='hp_open_online_library_v1';
const sample={read:[backup.read[0]],queue:[{...backup.read[1],id:'queue-book',rating:null}]};
const copy=value=>JSON.parse(JSON.stringify(value));

for(const lang of ['en','ru']){
  test(`Chromium library import/export (${lang})`,async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    t.after(()=>browser.close());
    const context=await browser.newContext({acceptDownloads:true});
    const page=await context.newPage();
    const errors=[],dialogs=[];
    let acceptReplacement=true;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',async dialog=>{
      dialogs.push({type:dialog.type(),message:dialog.message()});
      if(dialog.type()==='confirm'&&!acceptReplacement)await dialog.dismiss();
      else await dialog.accept();
    });
    await page.route('http://library.test/**',route=>{
      const shared=new URL(route.request().url()).pathname==='/js/language.js';
      return route.fulfill({contentType:shared?'text/javascript':'text/html; charset=utf-8',
        body:shared?fs.readFileSync(path.join(__dirname,'../homoprovincialis-site/js/language.js'),'utf8'):html});
    });
    await page.addInitScript(({key,value})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,value);},{key:KEY,value:JSON.stringify(sample)});
    await page.goto('http://library.test/open-online-library.html');
    await page.locator(`[data-language="${lang}"]`).click();
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.equal(await page.locator('#app-title').textContent(),lang==='ru'?'Открытая онлайн-библиотека':'Open Online Library');
    assert.equal(await page.locator('#read-count').textContent(),'1');
    assert.equal(await page.locator('#queue-count').textContent(),'1');
    const raw=()=>page.evaluate(key=>localStorage.getItem(key),KEY);
    const initial=await raw();
    const originalCards=await page.locator('.book').allTextContents();
    async function importText(text){
      const count=dialogs.length;
      await page.locator('#import-json').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(text)});
      await page.waitForFunction(()=>{const input=document.getElementById('import-json');return !input.disabled&&input.value==='';});
      return dialogs.slice(count);
    }
    async function importObject(value){return importText(JSON.stringify(value));}
    async function exported(){
      const event=page.waitForEvent('download');
      await page.locator('#export-json').click();
      const download=await event;
      assert.equal(download.suggestedFilename(),'open-online-library-backup.json');
      const stream=await download.createReadStream(),chunks=[];
      for await(const chunk of stream)chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    const invalid=[];
    for(const [label,value]of [['null',null],['array',[]],['string','text'],['number',3],['missing queue',{read:[]}],['non-array shelf',{read:{},queue:[]}],['extra root key',{...sample,extra:true}]])invalid.push([label,JSON.stringify(value)]);
    for(const [label,mutate]of [
      ['null book',s=>s.read[0]=null],['array book',s=>s.read[0]=[]],
      ['missing field',s=>delete s.read[0].author],['object title',s=>s.read[0].en={}],
      ['numeric title',s=>s.read[0].original=1],['null text',s=>s.read[0].author=null],
      ['array text',s=>s.read[0].ru=[]],['numeric year',s=>s.read[0].year=1933],
      ['blank titles',s=>Object.assign(s.read[0],{original:' ',ru:'\t',en:''})],
      ['oversized text',s=>s.read[0].en='x'.repeat(10001)],
      ['missing id',s=>delete s.read[0].id],['blank id',s=>s.read[0].id=' '],
      ['numeric id',s=>s.read[0].id=7],['oversized id',s=>s.read[0].id='x'.repeat(257)],
      ['duplicate across shelves',s=>s.queue[0].id=s.read[0].id],
      ['duplicate on shelf',s=>s.read.push(copy(s.read[0]))],
      ['zero rating',s=>s.read[0].rating=0],['rating over ten',s=>s.read[0].rating=11],
      ['fractional rating',s=>s.read[0].rating=1.5],['string rating',s=>s.read[0].rating='9'],
      ['null rating',s=>s.read[0].rating=null],['boolean rating',s=>s.read[0].rating=true],
      ['HTML rating',s=>s.read[0].rating='<img src=x onerror="window.__xss=1">'],
      ['queue rating',s=>s.queue[0].rating=9],
      ['extra book property',s=>s.read[0].extra='<script>window.__xss=1</script>'],
      ['prototype property',s=>s.read[0]=JSON.parse(JSON.stringify(s.read[0]).replace(/}$/,',"__proto__":{"polluted":true}}'))],
      ['invalid last book',s=>s.queue.push(null)],
      ['too many books',s=>s.queue=Array.from({length:10001},(_,i)=>({...s.queue[0],id:'q'+i}))]
    ]){const value=copy(sample);mutate(value);invalid.push([label,JSON.stringify(value)]);}
    invalid.push(['malformed JSON','{"read":['],['empty file',''],['HTML document','<script>window.__xss=1</script>']);
    for(const [label,text]of invalid){
      await t.test(`reject ${label} without changing library`,async()=>{
        const shown=await importText(text);
        assert.equal(shown.length,1);
        assert.equal(shown[0].type,'alert');
        assert.match(shown[0].message,lang==='ru'?/Неверный JSON-файл/:/Invalid library JSON/);
        assert.equal(await raw(),initial);
        assert.deepEqual(await page.locator('.book').allTextContents(),originalCards);
        assert.equal(await page.evaluate(()=>window.__xss),undefined);
      });
    }
    await t.test('reject oversized file before parsing',async()=>{
      const shown=await importText(' '.repeat(10*1024*1024+1));
      assert.match(shown[0].message,lang==='ru'?/слишком большой/:/too large/);
      assert.equal(await raw(),initial);
    });
    await t.test('read failure leaves existing library intact',async()=>{
      await page.evaluate(()=>{window.originalFileText=File.prototype.text;File.prototype.text=async()=>{throw new Error('read failed');};});
      const shown=await importObject(sample);
      assert.match(shown[0].message,lang==='ru'?/Не удалось прочитать/:/Could not read/);
      assert.equal(await raw(),initial);
      await page.evaluate(()=>{File.prototype.text=window.originalFileText;});
    });
    await t.test('cancel replacement including empty catalog',async()=>{
      acceptReplacement=false;
      for(const value of [backup,{read:[],queue:[]}]){
        const shown=await importObject(value);
        assert.equal(shown[0].type,'confirm');
        assert.match(shown[0].message,lang==='ru'?/Заменить текущую/:/Replace the current/);
        assert.equal(await raw(),initial);
      }
      acceptReplacement=true;
    });
    await t.test('storage failure preserves live and persisted data and export',async()=>{
      await page.evaluate(key=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Full','QuotaExceededError');return window.originalSetItem.call(this,k,v);};},KEY);
      const shown=await importObject(backup);
      assert.equal(shown.length,2);
      assert.match(shown[1].message,lang==='ru'?/Не удалось сохранить/:/Could not save/);
      assert.equal(await raw(),initial);
      assert.deepEqual(await page.locator('.book').allTextContents(),originalCards);
      assert.deepEqual(await exported(),sample);
      await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
    });
    await t.test('metadata with markup remains literal text; export round-trip',async()=>{
      const hostile=copy(sample);
      const payload='\"><img src=x onerror="window.__xss=1"><svg onload="window.__xss=2"></svg><script>window.__xss=3</script>&lt;b&gt;';
      Object.assign(hostile.read[0],{id:payload,original:payload,ru:payload,en:payload,author:payload,year:payload});
      await importObject(hostile);
      assert.equal(await page.locator('#read-list .book-title').textContent(),payload);
      assert.equal(await page.locator('#read-list .book-meta').textContent(),`${lang==='ru'?'Автор':'Author'}: ${payload}${lang==='ru'?'Год':'Year'}: ${payload}`);
      assert.equal(await page.locator('#read-list img, #read-list svg, #read-list script').count(),0);
      assert.equal(await page.evaluate(()=>window.__xss),undefined);
      assert.deepEqual(await exported(),hostile);
      await page.locator('#read-list [data-a="edit"]').click();
      assert.equal(await page.locator('#read-original').inputValue(),payload);
      await page.locator('#save-read').click();
      assert.deepEqual(await exported(),hostile);
      await importObject(hostile);
      assert.deepEqual(await exported(),hostile);
    });
    await t.test('previously stored HTML rating is escaped on load',async()=>{
      const legacy=copy(sample);
      legacy.read[0].rating='<img src=x onerror="window.__xss=1">';
      await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:KEY,value:JSON.stringify(legacy)});
      await page.reload();
      await page.locator(`[data-language="${lang}"]`).click();
      assert.equal(await page.locator('#read-list .rating strong').textContent(),legacy.read[0].rating+'/10');
      assert.equal(await page.locator('#read-list img').count(),0);
      assert.equal(await page.evaluate(()=>window.__xss),undefined);
    });
    await t.test('existing 37-book backup imports and exports without data loss',async()=>{
      await importObject(backup);
      assert.equal(await page.locator('#read-count').textContent(),'37');
      assert.equal(await page.locator('#queue-count').textContent(),'0');
      assert.deepEqual(await exported(),backup);
      await page.reload();
      await page.locator(`[data-language="${lang}"]`).click();
      assert.deepEqual(await exported(),backup);
      await page.locator('#catalog-search').fill('Robinson');
      assert.equal(await page.locator('#read-list .book').count(),1);
      await page.locator('#catalog-search').fill('');
      assert.equal(await page.locator('#read-list .book').count(),37);
    });
    await t.test('add, edit, move and re-import exported books still work',async()=>{
      await page.locator('#add-queue').click();
      await page.locator('#queue-original').fill('New <book> & "notes"');
      await page.locator('#queue-year').fill('c. 1900–1905');
      await page.locator('#save-queue').click();
      await page.locator('#queue-list [data-a="edit"]').click();
      await page.locator('#queue-author').fill('Author <name>');
      await page.locator('#save-queue').click();
      const saved=await exported();
      await importObject(saved);
      assert.deepEqual(await exported(),saved);
      const promptHandler=async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.accept('8');};
      page.removeAllListeners('dialog');page.on('dialog',promptHandler);
      await page.locator('#queue-list [data-a="move"]').click();
      assert.equal(await page.locator('#queue-count').textContent(),'0');
      assert.equal(await page.locator('#read-count').textContent(),'38');
      const moved=await exported();
      assert.equal(moved.read.find(b=>b.original==='New <book> & "notes"').rating,8);
    });
    assert.deepEqual(errors,[],'No uncaught browser exceptions');
  });
}
