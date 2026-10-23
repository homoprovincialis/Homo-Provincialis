/* World Direct Democracy: non-destructive, versioned browser storage. */
(function(global){
  'use strict';
  const KEY='hp_direct_democracy_v6_safe';
  const LEGACY_KEYS=['hp_direct_democracy_v5_full_name','hp_direct_democracy_v4_pristine',
    'hp_direct_democracy_v3_clean_start','hp_direct_democracy_v2_clean',
    'hp_direct_democracy_v1','homoprovincialis_direct_democracy_v1'];
  const MARKER='hp_direct_democracy_v5_full_name_initialized';
  const BACKUP_PREFIX='hp_direct_democracy_recovery_v1:';
  const KEYS=[KEY,...LEGACY_KEYS,MARKER];
  const ROLES=['autoritas','mentor','magister','discipulus_maior','discipulus','socius','participant','candidatus','observator','guest'];
  const TYPES=['proposal','law','dispute','accusation','exclusion'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fail(code){const error=new Error(code);error.code=code;throw error;}
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function need(condition){if(!condition)fail('INVALID');}
  function text(value){need(typeof value==='string');}
  function identifier(value){text(value);need(value.trim().length>0);}
  function percentage(value,min){need(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=100);}
  function date(value){text(value);need(Number.isFinite(Date.parse(value)));}
  function unique(list){need(Array.isArray(list));const seen=new Set();for(const row of list){need(object(row));identifier(row.id);need(!seen.has(row.id));seen.add(row.id);}return seen;}
  function optionalText(row,keys){for(const key of keys)if(Object.hasOwn(row,key))text(row[key]);}
  function validate(state){
    need(object(state));identifier(state.current);
    const communityIds=unique(state.communities);need(communityIds.size>0&&communityIds.has(state.current));
    const membersByCommunity=new Map();
    for(const community of state.communities){
      text(community.name);text(community.desc);optionalText(community,['nameRu','descRu']);
      percentage(community.ordinary,50);percentage(community.law,50);percentage(community.quorum,1);
      const members=unique(community.members);membersByCommunity.set(community.id,members);
      for(const member of community.members){
        text(member.name);optionalText(member,['nameRu']);need(ROLES.includes(member.role)&&typeof member.active==='boolean');
      }
      const creators=community.members.filter(member=>member.role==='autoritas');
      need(creators.length===1&&creators[0].name==='Ramon Eyquem');
      if(Object.hasOwn(creators[0],'nameRu'))need(creators[0].nameRu==='Ramon Eyquem');
    }
    unique(state.cases);unique(state.laws);
    for(const entry of [...state.cases,...state.laws]){
      need(communityIds.has(entry.communityId)&&TYPES.includes(entry.type));
      text(entry.title);text(entry.text);percentage(entry.threshold,50);
      need(object(entry.votes));
    }
    for(const entry of state.cases){
      const members=membersByCommunity.get(entry.communityId);
      need(members.has(entry.initiator));
      need(entry.target===null||members.has(entry.target));
      if(['dispute','accusation','exclusion'].includes(entry.type))need(members.has(entry.target));
      need(['open','passed','rejected'].includes(entry.status));percentage(entry.quorum,1);date(entry.createdAt);
      if(entry.status!=='open'||Object.hasOwn(entry,'finalizedAt'))date(entry.finalizedAt);
      for(const [memberId,vote]of Object.entries(entry.votes))need(members.has(memberId)&&['yes','no','abstain'].includes(vote));
    }
    for(const law of state.laws){
      need(['passed','rejected'].includes(law.status));date(law.finalizedAt);
      for(const key of ['yes','no','abstain','eligible'])need(Number.isSafeInteger(law.votes[key])&&law.votes[key]>=0);
      need(law.votes.yes+law.votes.no+law.votes.abstain<=law.votes.eligible);
    }
    // Preserve all unknown metadata verbatim as JSON; never merge or drop fields.
    return state;
  }
  function decode(raw,envelope){
    let value;try{value=JSON.parse(raw);}catch(error){fail('INVALID');}
    if(envelope){need(object(value));if(value.schemaVersion!==6)fail('VERSION');value=value.state;}
    return validate(value);
  }
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  function decodeImport(value){
    if(object(value)&&value.format==='hp-democracy-recovery'&&value.version===1){
      need(object(value.entries)&&[KEY,...LEGACY_KEYS].includes(value.restoreKey));
      need(typeof value.entries[value.restoreKey]==='string');
      return decode(value.entries[value.restoreKey],value.restoreKey===KEY);
    }
    return validate(value);
  }
  async function open(storage,locks,makeFresh){
    let state=null,baseline=null,observed={},restoreKey=null,blocked=false,errorCode=null;
    const capture=()=>{const entries={};for(const key of KEYS)entries[key]=storage.getItem(key);return entries;};
    const locked=fn=>{if(!locks||typeof locks.request!=='function')fail('LOCKS');return locks.request(KEY,{mode:'exclusive'},fn);};
    function unchanged(){
      if(storage.getItem(KEY)!==baseline)fail('CONFLICT');
      if(baseline===null)for(const key of LEGACY_KEYS)if(storage.getItem(key)!==observed[key])fail('CONFLICT');
    }
    function snapshot(reason,restoreKey){
      const entries=capture();
      const raw=JSON.stringify({format:'hp-democracy-recovery',version:1,reason,restoreKey,entries});
      let backupKey;
      for(let attempt=0;attempt<10;attempt++){
        backupKey=BACKUP_PREFIX+Date.now()+'-'+Math.random().toString(36).slice(2);
        if(storage.getItem(backupKey)===null)break;
        backupKey=null;
      }
      if(!backupKey)fail('BACKUP');
      storage.setItem(backupKey,raw);
      if(storage.getItem(backupKey)!==raw)fail('BACKUP');
    }
    function commit(next,reason){
      if(blocked)fail(errorCode||'BLOCKED');
      const candidate=clone(validate(next));
      unchanged();
      if(reason){snapshot(reason,baseline===null?LEGACY_KEYS.find(key=>observed[key]!==null):KEY);unchanged();}
      const raw=JSON.stringify({schemaVersion:6,state:candidate});
      storage.setItem(KEY,raw); // Atomic single-key replacement; no removeItem anywhere.
      baseline=raw;state=candidate;
    }
    function inspect(){
      observed=capture();baseline=observed[KEY];
      if(baseline!==null){state=decode(baseline,true);restoreKey=KEY;return null;}
      const sources=LEGACY_KEYS.filter(key=>observed[key]!==null);
      if(!sources.length){state=validate(makeFresh());return null;}
      const candidates=sources.map(key=>decode(observed[key],false));
      if(candidates.some(value=>canonical(value)!==canonical(candidates[0])))fail('AMBIGUOUS');
      state=clone(candidates[0]);restoreKey=sources[0];return sources[0];
    }
    try{
      if(!locks||typeof locks.request!=='function'){inspect();fail('LOCKS');}
      await locked(()=>{
        const source=inspect();
        if(source){
          snapshot('migration',source);unchanged();
          const raw=JSON.stringify({schemaVersion:6,state});
          storage.setItem(KEY,raw);baseline=raw;
        }
      });
    }catch(error){blocked=true;errorCode=error.code||'STORAGE';}
    return {
      get state(){return state===null?null:clone(state);},
      get blocked(){return blocked;},get errorCode(){return errorCode;},
      block(code){blocked=true;errorCode=code;},
      async run(fn){
        if(blocked)fail(errorCode||'BLOCKED');
        try{return await locked(()=>{unchanged();return fn();});}
        catch(error){blocked=true;errorCode=error.code||'STORAGE';throw error;}
      },
      commit,
      recovery(){
        // Include every source, even malformed JSON, and all retained recovery points.
        const entries={...observed},latestEntries={};
        if(Object.hasOwn(observed,KEY))entries[KEY]=baseline;
        for(const key of KEYS){
          try{latestEntries[key]=storage.getItem(key);if(!Object.hasOwn(entries,key))entries[key]=latestEntries[key];}
          catch(error){/* Preserve captured bytes and continue reading other keys. */}
        }
        try{
          for(let i=0;i<storage.length;i++){
            const key=storage.key(i);
            if(key&&key.startsWith(BACKUP_PREFIX))entries[key]=storage.getItem(key);
          }
        }catch(error){/* Export all recovery points still accessible. */}
        return {format:'hp-democracy-recovery',version:1,restoreKey:baseline!==null?KEY:restoreKey,entries,latestEntries};
      }
    };
  }
  global.DemocracyStorage=Object.freeze({open,validate,decodeImport,KEY,LEGACY_KEYS:Object.freeze(LEGACY_KEYS),BACKUP_PREFIX});
})(window);
