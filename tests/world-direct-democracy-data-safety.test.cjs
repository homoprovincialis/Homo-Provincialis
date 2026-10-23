'use strict';
// node --test tests/world-direct-democracy-data-safety.test.cjs
// Requires Playwright + Chromium. All records below are isolated synthetic fixtures.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'../homoprovincialis-site');
const KEY='hp_direct_democracy_v6_safe',OLD='hp_direct_democracy_v5_full_name';
const LEGACY=[OLD,'hp_direct_democracy_v4_pristine','hp_direct_democracy_v3_clean_start','hp_direct_democracy_v2_clean','hp_direct_democracy_v1','homoprovincialis_direct_democracy_v1'];
const MARKER=OLD+'_initialized',PREFIX='hp_direct_democracy_recovery_v1:';
const ROLES=['autoritas','mentor','magister','discipulus_maior','discipulus','socius','participant','candidatus','observator','guest'];
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const communities=['c1','c2'].map(id=>({id,name:'Test community '+id,nameRu:'Тестовое сообщество '+id,desc:'Synthetic only',descRu:'Только тест',ordinary:50,law:67,quorum:100,
    members:ROLES.map((role,i)=>({id:id+'m'+i,name:i?'Test member '+i:'Ramon Eyquem',nameRu:i?'Тестовый участник '+i:'Ramon Eyquem',role,active:i!==9,extra:{keep:'member metadata'}})),extra:{keep:'community metadata'}}));
  const cases=['proposal','law','dispute','accusation','exclusion'].map((type,i)=>({id:'k'+i,communityId:'c1',type,initiator:'c1m1',target:i>1?'c1m2':null,title:'Test '+type,text:'Synthetic statement',threshold:type==='law'?67:type==='exclusion'?100:50,quorum:100,votes:{c1m0:'yes',c1m1:'no',c1m9:'abstain'},status:'open',createdAt:'2026-10-01T00:00:00.000Z',extra:['keep','case metadata']}));
  cases.push({...clone(cases[0]),id:'closed',status:'passed',finalizedAt:'2026-10-02T00:00:00.000Z'});
  const laws=['passed','rejected'].map((status,i)=>({id:'l'+i,communityId:'c1',type:'law',title:'Test decision '+i,text:'Synthetic decision',status,finalizedAt:'2026-10-02T00:00:00.000Z',threshold:67,votes:{yes:2,no:1,abstain:0,eligible:3},extra:{keep:'law metadata'}}));
  return {current:'c1',communities,cases,laws,extra:{keep:'root metadata',nested:[1,'Текст',null]}};
}
const envelope=s=>JSON.stringify({schemaVersion:6,state:s});
const html=fs.readFileSync(path.join(root,'world-direct-democracy-system.html'),'utf8');
const beforeHtml=require('node:child_process').execFileSync('git',['show','1ee2d76:homoprovincialis-site/world-direct-democracy-system.html'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});

test('World Direct Democracy data safety in Chromium',async t=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(()=>browser.close());
  async function open(seed={},options={}){
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
    await context.route('https://democracy.test/**',r=>{
      const name=new URL(r.request().url()).pathname.slice(1);
      return r.fulfill({body:options.before&&name==='world-direct-democracy-system.html'?beforeHtml:fs.readFileSync(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8'});
    });
    await context.addInitScript(({seed,options,key,prefix})=>{
      const storage=localStorage;
      const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
      window.__storage=storage;window.__get=get;window.__set=set;
      if(!sessionStorage.getItem('fixture-seeded')){
        for(const [k,v]of Object.entries(seed))set.call(storage,k,v);
        sessionStorage.setItem('fixture-seeded','1');
      }
      window.__fault=options.fault||null;
      Storage.prototype.getItem=function(k){
        if(this===storage&&window.__fault==='read'&&k===key)throw new DOMException('Denied','SecurityError');
        return get.call(this,k);
      };
      Storage.prototype.setItem=function(k,v){
        if(this===storage&&((window.__fault==='backup'&&k.startsWith(prefix))||(window.__fault==='write'&&k===key)))throw new DOMException('Full','QuotaExceededError');
        if(this===storage&&window.__fault==='backup-unverified'&&k.startsWith(prefix))return;
        return set.call(this,k,v);
      };
      if(options.noLocks)Object.defineProperty(navigator,'locks',{value:undefined});
    },{seed,options,key:KEY,prefix:PREFIX});
    const page=await context.newPage(),errors=[],dialogs=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',async d=>{dialogs.push(d.message());if(options.cancel&&d.type()==='confirm')await d.dismiss();else await d.accept();});
    await page.goto('https://democracy.test/world-direct-democracy-system.html');
    await page.waitForFunction(()=>typeof ddLanguage==='function'&&document.getElementById('app-title').textContent);
    await page.evaluate(lang=>ddLanguage(lang),options.lang||'en');
    const read=k=>page.evaluate(k=>window.__get.call(window.__storage,k),k);
    const all=()=>page.evaluate(()=>Object.fromEntries(Object.keys(window.__storage).map(k=>[k,window.__get.call(window.__storage,k)])));
    async function exported(){
      await page.locator('[data-tab="data"]').click();
      const event=page.waitForEvent('download');await page.locator('#export-json').click();
      const download=await event,stream=await download.createReadStream(),chunks=[];
      for await(const chunk of stream)chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    async function imported(value){
      await page.locator('[data-tab="data"]').click();
      await page.locator('#import-json').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
      await page.waitForFunction(()=>!document.getElementById('import-json').value);
    }
    return {context,page,errors,dialogs,read,all,exported,imported};
  }
  async function run(seed,options,fn){const app=await open(seed,options);try{await fn(app);assert.deepEqual(app.errors,[]);}finally{await app.context.close();}}
  for(const lang of ['en','ru']){
    const options={lang};
    await t.test(`${lang}: new installation does not write a database or create demo records`,()=>run({},options,async app=>{
      assert.equal(await app.read(KEY),null);for(const key of LEGACY)assert.equal(await app.read(key),null);
      assert.equal(await app.page.locator('#members-list .dd-member').count(),1);
      assert.equal(await app.page.locator('#s-open').textContent(),'0');
      assert.equal(await app.page.locator('#s-laws').textContent(),'0');
    }));
    for(const key of LEGACY)await t.test(`${lang}: migrate ${key} without deleting or changing source`,async()=>{
      const state=fixture(),raw=JSON.stringify(state,null,2);
      await run({[key]:raw,'unrelated-project':'untouched'},options,async app=>{
        assert.equal(await app.read(key),raw);assert.equal(await app.read(MARKER),null);
        assert.equal(await app.read('unrelated-project'),'untouched');
        assert.deepEqual(JSON.parse(await app.read(KEY)),{schemaVersion:6,state});
        const backups=Object.entries(await app.all()).filter(([k])=>k.startsWith(PREFIX));
        assert.equal(backups.length,1);const saved=JSON.parse(backups[0][1]);
        assert.equal(saved.reason,'migration');assert.equal(saved.entries[key],raw);
        assert.deepEqual(await app.exported(),state);
        const stored=await app.read(KEY);
        await app.page.reload();await app.page.waitForFunction(()=>document.getElementById('app-title').textContent);
        assert.equal(await app.read(KEY),stored);assert.equal(Object.keys(await app.all()).filter(k=>k.startsWith(PREFIX)).length,1);
      });
    });
    for(const marker of [null,'1'])await t.test(`${lang}: v5 preserved with CLEAN_MARK=${marker}`,async()=>{
      const state=fixture(),raw=JSON.stringify(state),seed={[OLD]:raw};if(marker!==null)seed[MARKER]=marker;
      await run(seed,options,async app=>{assert.deepEqual(await app.exported(),state);assert.equal(await app.read(OLD),raw);assert.equal(await app.read(MARKER),marker);});
    });
    await t.test(`${lang}: identical legacy states migrate once`,()=>{
      const raw=JSON.stringify(fixture());return run({[LEGACY[0]]:raw,[LEGACY[3]]:raw},options,async app=>{assert.deepEqual(JSON.parse(await app.read(KEY)).state,fixture());assert.equal(await app.read(LEGACY[3]),raw);});
    });
    await t.test(`${lang}: conflicting legacy states remain unchanged and exportable`,()=>{
      const one=JSON.stringify(fixture()),other=fixture();other.communities[0].name='Different history';const two=JSON.stringify(other);
      return run({[OLD]:one,[LEGACY[1]]:two},options,async app=>{
        assert.equal(await app.read(KEY),null);assert.equal(await app.read(OLD),one);assert.equal(await app.read(LEGACY[1]),two);
        assert.equal(await app.page.locator('#add-member').isDisabled(),true);
        const recovery=await app.exported();assert.equal(recovery.entries[OLD],one);assert.equal(recovery.entries[LEGACY[1]],two);
        assert.match(await app.page.locator('#storage-note').textContent(),lang==='ru'?/несколько разных/:/Several different/);
      });
    });
    const invalids=[['malformed','{broken'],['null','null'],['unknown shape','{"users":[],"votes":[]}']];
    for(const [name,change]of [
      ['dangling current',s=>s.current='missing'],['missing communities',s=>delete s.communities],['empty communities',s=>s.communities=[]],
      ['duplicate member',s=>s.communities[0].members.push(clone(s.communities[0].members[0]))],
      ['unknown role',s=>s.communities[0].members[1].role='unknown'],['creator name',s=>s.communities[0].members[0].name='Other'],
      ['second creator',s=>s.communities[0].members[1].role='autoritas'],['nonboolean active',s=>s.communities[0].members[1].active='true'],
      ['invalid threshold',s=>s.communities[0].ordinary='50'],['dangling initiator',s=>s.cases[0].initiator='missing'],
      ['dangling voter',s=>s.cases[0].votes.missing='yes'],['invalid vote',s=>s.cases[0].votes.c1m0='other'],
      ['dangling law community',s=>s.laws[0].communityId='missing'],['invalid tally',s=>s.laws[0].votes.yes=99],
      ['invalid date',s=>s.cases[0].createdAt='bad'],['missing creator',s=>s.communities[0].members.shift()]
    ]){const state=fixture();change(state);invalids.push([name,JSON.stringify(state)]);}
    for(const [name,raw]of invalids)await t.test(`${lang}: invalid ${name} never falls back to fresh persisted data`,()=>run({[OLD]:raw},options,async app=>{
      assert.equal(await app.read(OLD),raw);assert.equal(await app.read(KEY),null);
      assert.equal(await app.page.locator('#reset-data').isDisabled(),true);
      assert.equal((await app.exported()).entries[OLD],raw);
      assert.equal(Object.keys(await app.all()).filter(k=>k.startsWith(PREFIX)).length,0);
      await app.page.locator('[data-tab="book"]').click();
      assert.equal(await app.page.locator('#download-book').isDisabled(),true);
      assert.equal(await app.page.locator('#book-search').isDisabled(),true);
      assert.equal(await app.page.locator('#case-type').isDisabled(),true);
    }));
    for(const value of ['{broken',JSON.stringify({schemaVersion:99,state:fixture()})])await t.test(`${lang}: invalid current v6 never falls back to legacy`,()=>run({[KEY]:value,[OLD]:JSON.stringify(fixture())},options,async app=>{
      assert.equal(await app.read(KEY),value);assert.equal((await app.exported()).entries[KEY],value);assert.equal(await app.page.locator('#add-member').isDisabled(),true);
    }));
    for(const fault of ['read','backup','backup-unverified','write'])await t.test(`${lang}: migration failure ${fault} retains originals`,()=>{
      const raw=JSON.stringify(fixture());return run({[OLD]:raw},{...options,fault},async app=>{
        assert.equal(await app.read(OLD),raw);assert.equal(await app.read(KEY),null);
        assert.equal(await app.page.locator('#save-settings').isDisabled(),true);
        assert.equal((await app.exported()).entries[OLD],raw);
        await app.page.evaluate(()=>window.__fault=null);
        await app.page.reload();await app.page.waitForFunction(()=>document.getElementById('app-title').textContent);
        // Init script reinstates fault on reload; source must still be untouched.
        assert.equal(await app.read(OLD),raw);
      });
    });
    await t.test(`${lang}: missing Web Locks preserves all bytes and disables writes`,()=>{
      const raw=JSON.stringify(fixture());return run({[OLD]:raw},{...options,noLocks:true},async app=>{
        assert.equal(await app.read(OLD),raw);assert.equal(await app.read(KEY),null);assert.equal(await app.page.locator('#add-member').isDisabled(),true);
        assert.equal((await app.exported()).entries[OLD],raw);
      });
    });
    await t.test(`${lang}: mutation failure rolls memory back and preserves votes and decisions`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const before=await app.read(KEY);await app.page.evaluate(()=>window.__fault='write');
      await app.page.locator('#member-name').fill('Failure must not add');await app.page.locator('#add-member').click();
      await app.page.waitForFunction(()=>document.getElementById('add-member').disabled);
      assert.equal(await app.read(KEY),before);assert.equal(await app.page.locator('#members-list .dd-member').count(),10);
      assert.equal((await app.exported()).entries[KEY],before);
    }));
    await t.test(`${lang}: invalid imports preserve current state`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const before=await app.read(KEY);await app.imported('{broken');await app.imported({communities:[],cases:[],laws:[]});
      assert.equal(await app.read(KEY),before);assert.deepEqual(await app.exported(),fixture());
      assert.match(app.dialogs[0],lang==='ru'?/Не удалось прочитать/:/could not be read/);
    }));
    await t.test(`${lang}: import failure leaves old database and recovery snapshot`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const before=await app.read(KEY),next=fixture();next.communities[0].name='Replacement';await app.page.evaluate(()=>window.__fault='write');
      await app.imported(next);assert.equal(await app.read(KEY),before);
      const snapshots=Object.entries(await app.all()).filter(([k])=>k.startsWith(PREFIX));assert.equal(snapshots.length,1);assert.equal(JSON.parse(snapshots[0][1]).entries[KEY],before);
    }));
    await t.test(`${lang}: reset is recoverable and does not delete old versions`,()=>run({[KEY]:envelope(fixture()),[OLD]:JSON.stringify(fixture())},options,async app=>{
      const before=await app.read(KEY),legacy=await app.read(OLD);
      await app.page.locator('[data-tab="data"]').click();await app.page.locator('#reset-data').click();
      await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.cases.length===0,KEY);
      assert.equal(await app.read(OLD),legacy);
      const snapshot=JSON.parse(Object.entries(await app.all()).find(([k])=>k.startsWith(PREFIX))[1]);
      assert.equal(snapshot.entries[KEY],before);await app.imported(snapshot);
      assert.deepEqual(JSON.parse(await app.read(KEY)).state,fixture());
    }));
    await t.test(`${lang}: migration failure export restores the original state after storage recovers`,()=>{
      const state=fixture(),raw=JSON.stringify(state);return run({[OLD]:raw},{...options,fault:'write'},async app=>{
        const recovery=await app.exported();assert.equal(recovery.restoreKey,OLD);
        await app.page.evaluate(()=>window.__fault=null);
        // A fresh tab with recovered storage can import the exported source snapshot.
        await run({},options,async target=>{await target.imported(recovery);assert.deepEqual(JSON.parse(await target.read(KEY)).state,state);});
      });
    });
    await t.test(`${lang}: cancel import and reset never changes data`,()=>run({[KEY]:envelope(fixture())},{...options,cancel:true},async app=>{
      const before=await app.read(KEY);await app.imported(fixture());await app.page.locator('#reset-data').click();assert.equal(await app.read(KEY),before);
      assert.equal(Object.keys(await app.all()).filter(k=>k.startsWith(PREFIX)).length,0);
    }));
    await t.test(`${lang}: normal additions, voting and decisions preserve all other records`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      await app.page.locator('#member-name').fill('Synthetic addition');await app.page.locator('#add-member').click();
      await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.communities[0].members.length===11,KEY);
      let state=JSON.parse(await app.read(KEY)).state;assert.deepEqual(state.cases,fixture().cases);assert.deepEqual(state.laws,fixture().laws);assert.deepEqual(state.extra,fixture().extra);
      await app.page.locator('[data-tab="case"]').click();await app.page.locator('#case-title').fill('Synthetic proposal');await app.page.locator('#case-text').fill('Synthetic text');await app.page.locator('#open-case').click();
      await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.cases.length===7,KEY);
      const proposal=app.page.locator('.dd-case').filter({hasText:'Synthetic proposal'});
      await proposal.locator('.voter').selectOption('c1m0');await proposal.locator('[data-v="yes"]').click();
      await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.cases.find(k=>k.title==='Synthetic proposal').votes.c1m0==='yes',KEY);
      state=JSON.parse(await app.read(KEY)).state;assert.deepEqual(state.cases.slice(0,6),fixture().cases);assert.deepEqual(state.laws,fixture().laws);
      assert.deepEqual(state.communities[0].members.slice(0,10),fixture().communities[0].members);
      await app.page.locator('[data-tab="community"]').click();
      assert.equal(await app.page.locator('#hierarchy-list').innerText().then(s=>s.split('\n').length),11);
      assert.match(await app.page.locator('#members-list').textContent(),lang==='ru'?/Первый AUCTORITAS/:/First AUCTORITAS/);
    }));
    await t.test(`${lang}: a finalized vote appends a decision without changing history`,async()=>{
      const original=fixture();original.communities[0].quorum=10;
      await run({[KEY]:envelope(original)},options,async app=>{
        await app.page.locator('[data-tab="case"]').click();await app.page.locator('#case-title').fill('Finalize test');await app.page.locator('#case-text').fill('Synthetic only');await app.page.locator('#open-case').click();
        const row=app.page.locator('.dd-case').filter({hasText:'Finalize test'});
        await row.locator('[data-v="yes"]').click();
        await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.cases.find(k=>k.title==='Finalize test').votes.c1m0==='yes',KEY);
        await row.locator('.close').click();
        await app.page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.laws.length===3,KEY);
        const state=JSON.parse(await app.read(KEY)).state;
        assert.deepEqual(state.cases.slice(0,6),original.cases);assert.deepEqual(state.laws.slice(0,2),original.laws);
        assert.deepEqual(state.communities,original.communities);assert.equal(state.laws[2].status,'passed');
      });
    });
    await t.test(`${lang}: a rejected invalid mutation restores the last committed state`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const before=await app.read(KEY);
      await app.page.evaluate(()=>{const option=new Option('invalid','invalid');document.getElementById('member-role').add(option);document.getElementById('member-role').value='invalid';});
      await app.page.locator('#member-name').fill('Invalid role');await app.page.locator('#add-member').click();
      await app.page.waitForFunction(()=>document.getElementById('add-member').disabled);
      assert.equal(await app.read(KEY),before);assert.equal(await app.page.locator('#members-list .dd-member').count(),10);
    }));
    await t.test(`${lang}: stale concurrent tab cannot overwrite newer votes`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const before=await app.read(KEY),newer=fixture();newer.cases[0].votes.c1m0='abstain';
      await app.page.evaluate(({key,raw})=>window.__set.call(window.__storage,key,raw),{key:KEY,raw:envelope(newer)});
      await app.page.locator('#member-name').fill('Stale change');await app.page.locator('#add-member').click();
      await app.page.waitForFunction(()=>document.getElementById('add-member').disabled);
      assert.notEqual(await app.read(KEY),before);assert.deepEqual(JSON.parse(await app.read(KEY)).state,newer);
    }));
    await t.test(`${lang}: storage event from a second tab blocks stale writes`,()=>run({[KEY]:envelope(fixture())},options,async app=>{
      const second=await app.context.newPage();await second.goto('https://democracy.test/world-direct-democracy-system.html');
      await second.waitForFunction(()=>document.getElementById('app-title').textContent);
      await second.locator('#member-name').fill('Only second tab');await second.locator('#add-member').click();
      await app.page.waitForFunction(()=>document.getElementById('add-member').disabled);
      const state=JSON.parse(await app.read(KEY)).state;assert.equal(state.communities[0].members.length,11);assert.deepEqual(state.cases,fixture().cases);
    }));
  }
  for(const lang of ['en','ru'])for(const width of [1280,390])await t.test(`unchanged design: ${lang}, ${width}px`,async()=>{
    const images=[];
    for(const before of [true,false]){
      const app=await open({[OLD]:JSON.stringify(fixture()),[MARKER]:'1'},{lang,before});
      try{await app.page.setViewportSize({width,height:900});images.push(await app.page.screenshot({fullPage:true,animations:'disabled'}));}
      finally{await app.context.close();}
    }
    assert.deepEqual(images[0],images[1]);
  });
  await t.test('voting functions and ten-level hierarchy match main byte-for-byte',()=>{
    const before=beforeHtml;
    for(const name of ['fresh','active','eligible','counts','outcome','finalize']){
      const source=s=>{const start=s.indexOf('function '+name+'(');let i=s.indexOf('{',start),depth=1;for(i++;depth;i++){if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i);};
      assert.equal(source(html),source(before));
    }
    assert.equal(html.slice(html.indexOf('const L='),html.indexOf('const t=')),before.slice(before.indexOf('const L='),before.indexOf('const t=')));
    assert.equal(html.match(/const ROLE_ORDER=\[[^;]+;/)[0],before.match(/const ROLE_ORDER=\[[^;]+;/)[0]);
    assert.equal(html.match(/const ROLE_KEY=\{[^;]+;/)[0],before.match(/const ROLE_KEY=\{[^;]+;/)[0]);
    assert.equal(html.split('<script')[0],before.split('<script')[0]);
  });
});
