/* Shared UI preference only; application data and legacy preferences are never written. */
(function(global){
  'use strict';
  const KEY='hp-language';
  const LEGACY_KEYS=['homoprovincialis-language','hp_translation_ui_lang_v1','language','lang','siteLanguage'];
  const renderers=new Set();
  const valid=value=>value==='en'||value==='ru';
  function stored(key){try{return global.localStorage.getItem(key);}catch(error){return null;}}
  function preferred(){
    for(const key of [KEY,...LEGACY_KEYS]){const value=stored(key);if(valid(value))return value;}
    return 'en';
  }
  let current=preferred();
  function root(){document.documentElement.lang=current;}
  function standardPage(){
    document.querySelectorAll('.lang.lang-en').forEach(el=>el.style.display=current==='en'?'block':'none');
    document.querySelectorAll('.lang.lang-ru').forEach(el=>el.style.display=current==='ru'?'block':'none');
  }
  function buttons(){
    document.querySelectorAll('button').forEach(button=>{
      const match=(button.getAttribute('onclick')||'').match(/^(?:setLanguage|ddLanguage|setLibraryLanguage)\(['"](en|ru)['"]\)$/);
      const choice=button.dataset.language||button.dataset.lang||button.dataset.choice||
        (match&&match[1])||(button.id==='switchRu'?'ru':button.id==='switchEn'?'en':null);
      if(valid(choice))button.setAttribute('aria-pressed',String(choice===current));
    });
  }
  function render(){
    root();
    if(renderers.size)renderers.forEach(apply=>apply(current));
    else standardPage();
    buttons();
  }
  function set(language){
    if(!valid(language))return;
    current=language;
    try{global.localStorage.setItem(KEY,current);}catch(error){/* Switching still works in memory. */}
    root();
    if(document.readyState!=='loading')render();
  }
  function register(apply){
    renderers.add(apply);
    if(document.readyState!=='loading'){apply(current);buttons();}
  }
  global.HPLanguage=Object.freeze({KEY,get:()=>current,set,register});
  global.setLanguage=set; // Compatibility with existing navigation-independent buttons.
  root();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
  else render();
  global.addEventListener('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    current=preferred(); // Read the latest choice, not a potentially delayed event value.
    root();
    if(document.readyState!=='loading')render();
  });
})(window);
