import './styles.css';
import { STATUS, INTENT, MOODS, todayKey, displayDate, progressFor, isAvailable, releases, chooseCandidates, escapeHtml as h, safeImage } from './domain.js';
import sloth from '../Assets/Sloth on Beanbag with popcorn.png';
import monsters from '../Assets/Monsters of God.jpg';
import breath from '../Assets/Breath of Fire.jpeg';
import area51 from '../Assets/Area 51-Aliens, UFOs, Bob Lazar, etc..jpeg';
import farley from '../Assets/I am Chris Farley.jpeg';
import curve from '../Assets/Beyond the Curve.jpeg';
import cruella from '../Assets/Cruella.jpeg';
import futurama from '../Assets/Futurama.jpeg';
import sunny from "../Assets/It's Always Sunny in Philadelphia.jpeg";
import abbott from '../Assets/Abbott Elementary.jpeg';
const posters={'monsters-of-god':monsters,'breath-of-fire':breath,'ufo-documentary':area51,'i-am-chris-farley':farley,'behind-the-curve':curve,cruella,futurama,'always-sunny':sunny,'abbott-elementary':abbott};
const profiles=[{id:'parker',name:'Parker'},{id:'blake',name:'Blake'},{id:'porter',name:'Porter'}];
function storedProfile(){try{return localStorage.getItem('couchsloth-profile')||localStorage.getItem('couchsloth-user')?.toLowerCase();}catch{return null;}}
const stored=storedProfile();
let loadVersion=0;
const state={profile:profiles.some(p=>p.id===stored)?stored:null,profiles,titles:[],loading:true,error:'',connected:false,tab:'home',viewing:null,status:'watchlist',search:'',type:'all',service:'all',modal:null,draft:null,busy:false,message:'',picked:null,pickMessage:'',pick:{mood:'any',commitment:'any',pool:'library',audience:stored?[stored]:['parker']}};
const app=document.querySelector('#app');
const name=()=>state.profiles.find(p=>p.id===state.profile)?.name||'Parker';
const titleById=id=>state.titles.find(t=>t.id===id);
const icon=t=>t==='Movie'?'🎬':t==='Documentary'?'🔎':'📺';
const options=(map,selected)=>Object.entries(map).map(([id,label])=>`<option value="${id}" ${id===selected?'selected':''}>${h(label)}</option>`).join('');
function service(t){return t.streaming_availability?.find(a=>a.region==='US'&&a.status==='available')?.provider||(t.legacy_platform&&t.legacy_platform!=='Family pick'?`${t.legacy_platform} · unconfirmed`:'Streaming service unconfirmed');}
async function load(quiet=false){
  if(state.busy)return false;
  const version=++loadVersion;
  if(!quiet){state.loading=true;render();}
  try{
    const response=await fetch('/api/library',{cache:'no-store'});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'The library could not load.');
    if(version!==loadVersion)return false;
    state.titles=result.titles;state.profiles=profiles.map(p=>result.profiles.find(x=>x.id===p.id)||p);state.connected=true;state.error='';
  }catch(error){if(version!==loadVersion)return false;state.error=error.message||'Could not connect. Please retry.';state.connected=false;}
  state.loading=false;if(!quiet||!state.modal)render();return state.connected;
}
function setBusy(busy){state.busy=busy;document.querySelectorAll('.modal button,.modal input,.modal textarea,.modal select').forEach(el=>el.disabled=busy);}
async function save(data){
  if(state.busy)return false;++loadVersion;setBusy(true);state.message='';
  try{
    const response=await fetch('/api/library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,profileId:state.profile})});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'That change did not save.');
    setBusy(false);state.message='Saved to your couch. ✓';await load(true);render();return true;
  }catch(error){setBusy(false);state.message=error.message||'That change did not save. Please retry.';const message=document.querySelector('.form-message');if(message)message.textContent=state.message;return false;}
}
async function tmdbRequest(data){
  const response=await fetch('/api/tmdb',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok){const error=new Error(result.error||'Artwork lookup failed.');error.code=result.code;throw error;}
  return result;
}
function tmdbCandidatesMarkup(candidates){
  if(!candidates?.length)return '<p class="helper">TMDB did not return any likely matches.</p>';
  return `<div class="tmdb-candidates">${candidates.map(c=>`<article class="tmdb-candidate">${c.posterUrl?`<img src="${h(c.posterUrl)}" alt="" loading="lazy">`:`<div class="tmdb-placeholder">${c.mediaType==='movie'?'🎬':'📺'}</div>`}<div><strong>${h(c.title)}</strong><small>${h(c.year||'Year unknown')} · ${c.mediaType==='movie'?'Movie':'TV'}</small><p>${h(c.overview||'No description available.')}</p><button class="secondary" type="button" data-tmdb-apply data-tmdb-id="${c.id}" data-tmdb-type="${c.mediaType}">Use this artwork</button></div></article>`).join('')}</div>`;
}
async function applyArtwork(titleId,tmdbId,mediaType){
  const target=document.querySelector('#tmdb-match-results');
  if(target)target.innerHTML='<p class="helper">Saving the match…</p>';
  try{
    await tmdbRequest({action:'apply',titleId,tmdbId:Number(tmdbId),mediaType});
    await load(true);state.modal=titleId;state.message='Artwork and TMDB metadata saved. ✓';render();
  }catch(error){if(target)target.innerHTML=`<p class="helper">${h(error.message)}</p>`;}
}
function bindTmdbCandidateButtons(root=document){
  root.querySelectorAll('[data-tmdb-apply]').forEach(button=>button.onclick=()=>applyArtwork(state.modal,button.dataset.tmdbId,button.dataset.tmdbType));
}
async function autoArtwork(titleId,{silent=false}={}){
  const target=document.querySelector('#tmdb-match-results');
  const button=document.querySelector('[data-tmdb-auto]');
  if(!silent){if(button)button.disabled=true;if(target)target.innerHTML='<p class="helper">Searching TMDB and checking the match…</p>';}
  try{
    const result=await tmdbRequest({action:'auto',titleId});
    if(result.status==='applied'){
      await load(true);
      if(!silent){state.modal=titleId;state.message=`Artwork matched ${result.recommendation?.mode==='ai'?'with AI assistance':'automatically'}. ✓`;render();}
      return result;
    }
    if(!silent&&target){
      target.innerHTML=`<p class="helper">${h(result.recommendation?.reason||'Pick the correct title below.')}</p>${tmdbCandidatesMarkup(result.candidates)}`;
      bindTmdbCandidateButtons(target);
    }
    return result;
  }catch(error){
    if(!silent&&target)target.innerHTML=`<p class="helper">${h(error.message)}</p>`;
    return null;
  }finally{if(button)button.disabled=false;}
}
function empty(copy,action=''){return `<div class="empty-state"><span>🦥</span><p>${copy}</p>${action}</div>`;}
function card(t){
  const img=posters[t.id]||safeImage(t.poster_url);const progress=progressFor(t,state.viewing||state.profile);const saved=t.watch_progress?.map(p=>state.profiles.find(x=>x.id===p.profile_id)?.name).filter(Boolean)||[];
  return `<button class="title-card" data-title="${h(t.id)}"><div class="poster">${img?`<img src="${h(img)}" alt="" loading="lazy">`:`<span>${icon(t.type)}</span>`}${progress?`<span class="status-pill">${STATUS[progress.status]}</span>`:''}</div><div class="card-copy"><small>${h(t.type)}</small><h3>${h(t.title)}</h3><p>${h(service(t))}</p>${saved.length?`<small class="saved-by">Saved by ${h(saved.join(', '))}</small>`:''}</div></button>`;
}
function shelf(label,copy,titles,none){return `<section class="shelf"><div class="section-heading"><div><h2>${label}</h2><p>${copy}</p></div><span>${titles.length}</span></div>${titles.length?`<div class="title-grid">${titles.map(card).join('')}</div>`:empty(none)}</section>`;}
function home(){
  const today=todayKey(),end=new Date(`${today}T12:00:00`),start=new Date(`${today}T12:00:00`);end.setDate(end.getDate()+7);start.setDate(start.getDate()-14);const events=releases(state.titles);const unique=items=>[...new Map(items.map(e=>[e.title.id,e.title])).values()];
  return `<section class="hero"><div><p class="eyebrow">YOUR NEXT GOOD WATCH</p><h1>A little less scrolling.<br>A little more couch.</h1><p>Welcome back, ${h(name())}. Save the good stuff, keep your place, and let the sloth handle the indecision.</p><button class="primary" data-go="pick">Help me pick something ↗</button></div><img src="${sloth}" alt="A cozy sloth enjoying popcorn"></section>
  ${shelf('Continue Watching','Right where you left off.',state.titles.filter(t=>progressFor(t,state.profile)?.status==='watching'),'Mark a saved title as Watching to find it here.')}
  ${shelf('Available Now','U.S. availability recorded in your library.',state.titles.filter(t=>isAvailable(t,today)),'Streaming availability has not been added yet. Open a title to record where you can watch it.')}
  ${shelf('Just Released','Recorded releases from the last two weeks.',unique(events.filter(e=>e.date>=todayKey(start)&&e.date<=today)),'No recent release dates recorded yet.')}
  ${shelf('Coming This Week','Something to look forward to.',unique(events.filter(e=>e.date>today&&e.date<=todayKey(end))),'No releases recorded for the next seven days.')}
  ${shelf('Explore the Library','Save something for yourself—or see who else has it on their list.',state.titles,'Tap + Add to capture your first recommendation.')}`;
}
function coming(){
  const services=[...new Set(state.titles.flatMap(t=>t.streaming_availability?.map(a=>a.provider)||[]))].sort();const titles=state.titles.filter(t=>(state.type==='all'||state.type===t.type)&&(state.service==='all'||t.streaming_availability?.some(a=>a.provider===state.service&&a.region==='US')));
  const events=releases(titles).filter(e=>e.date>=todayKey()&&(state.service==='all'||!e.provider||e.provider===state.service));const undated=titles.filter(t=>t.streaming_availability?.some(a=>a.region==='US'&&a.status==='upcoming'&&!a.release_date&&(state.service==='all'||a.provider===state.service)));
  return `<div class="page-heading"><p class="eyebrow">A DATE WITH YOUR COUCH</p><h1>Coming Soon</h1><p>The releases you want to remember, in date order.</p></div><div class="filters"><label>Type<select data-filter="type">${options({all:'Everything',Series:'Series',Movie:'Movie',Documentary:'Documentary'},state.type)}</select></label><label>Service<select data-filter="service"><option value="all">All services</option>${services.map(s=>`<option ${state.service===s?'selected':''} value="${h(s)}">${h(s)}</option>`).join('')}</select></label></div>${events.length?`<div class="timeline">${events.map(e=>`<button class="release-row" data-title="${h(e.title.id)}"><time>${displayDate(e.date)}</time><div><h3>${h(e.title.title)}</h3><p>${h(e.label)} · ${e.source==='manual'?'Manually recorded':'Source recorded'}</p></div><span>↗</span></button>`).join('')}</div>`:empty('No upcoming dates recorded yet. Open a title to add season or streaming release details.')}${undated.length?shelf('Date Not Announced','Upcoming, with the date still to come.',undated,''):''}`;
}
function stuff(){
  const viewing=state.viewing||state.profile;const titles=state.titles.filter(t=>progressFor(t,viewing)?.status===state.status&&t.title.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="page-heading"><p class="eyebrow">THE GOOD STUFF, SAVED</p><h1>My Stuff</h1><p>Your list, your place. Peek at what the rest of the couch is saving.</p></div><div class="profile-tabs">${state.profiles.map(p=>`<button data-view="${p.id}" class="${viewing===p.id?'selected':''}">${p.name}${p.id===state.profile?' · you':''}</button>`).join('')}</div><div class="status-tabs">${Object.entries(STATUS).map(([id,label])=>`<button data-status="${id}" class="${state.status===id?'selected':''}">${label}<span>${state.titles.filter(t=>progressFor(t,viewing)?.status===id).length}</span></button>`).join('')}</div><label class="search-field"><span class="sr-only">Search saved titles</span><input id="saved-search" placeholder="Find something you saved…" value="${h(state.search)}"></label>${viewing!==state.profile?`<p class="helper">Viewing ${h(state.profiles.find(p=>p.id===viewing)?.name)}’s list. Changes are saved for ${h(name())}.</p>`:''}${titles.length?`<div class="title-grid">${titles.map(card).join('')}</div>`:empty(`Nothing in ${STATUS[state.status]}${state.search?' matching that search':' yet'}.`,'<button class="secondary" data-go="home">Explore the library</button>')}`;
}
function pick(){
  const picked=titleById(state.picked);
  return `<div class="page-heading"><p class="eyebrow">DECISION FATIGUE, MEET SLOTH</p><h1>Sloth Pick</h1><p>A few little clues. One less decision.</p></div><section class="pick-panel"><div class="form-grid"><label>The mood<select data-pick="mood">${options({any:'Surprise me',...MOODS},state.pick.mood)}</select></label><label>The commitment<select data-pick="commitment">${options({any:'Anything goes',short:'35 minutes or less',episodes:'A couple of episodes',movie:'Movie night'},state.pick.commitment)}</select></label><label>Choose from<select data-pick="pool">${options({library:'Library · services may be unconfirmed',saved:'Our saved titles · services may be unconfirmed',available:'Available Now only'},state.pick.pool)}</select></label></div><fieldset><legend>Who’s on the couch?</legend><div class="audience">${state.profiles.map(p=>`<label><input type="checkbox" data-audience="${p.id}" ${state.pick.audience.includes(p.id)?'checked':''}> ${p.name}</label>`).join('')}</div></fieldset><div class="pick-buttons"><button class="primary" data-pick-action="match">Pick for this mood ✦</button><button class="secondary" data-pick-action="chaos">🎲 Full Chaos</button></div><p class="helper">Finished and Caught Up titles are excluded for selected viewers. Full Chaos skips mood and time filters. Specific filters need matching tags or runtime data.</p></section>${picked?`<section class="pick-result"><p class="eyebrow">THE SLOTH HAS A SUGGESTION</p><h2>${h(picked.title)}</h2><p>${h(service(picked))}</p><p>${h(picked.description)}</p><button class="primary" data-title="${h(picked.id)}">See details & save</button></section>`:state.pickMessage?empty(h(state.pickMessage)):`<div class="quiet-sloth"><img src="${sloth}" alt="A sloth ready to choose"><p>Let’s find your next good watch.</p></div>`}`;
}
function welcome(){return `<div class="welcome"><img src="${sloth}" alt="A sloth with popcorn"><p class="eyebrow">MAKE YOURSELF COMFORTABLE</p><h1>Couch Sloth</h1><p>A home for the things you want to watch.<br>Whose list are we opening?</p><div class="profile-tabs">${state.profiles.map(p=>`<button data-profile="${p.id}">${p.name}</button>`).join('')}</div><small>A shared family library, with separate lists and watched progress.</small></div>`;}
function details(t){
  if(!t)return '<h2>Refresh your library</h2><p>This title was saved, but the latest library could not be loaded. Close this panel and retry the connection.</p>';
  const p=progressFor(t,state.profile);const seasons=[...(t.seasons||[])].sort((a,b)=>a.season_number-b.season_number);const detailImage=posters[t.id]||safeImage(t.poster_url);
  return `<p class="eyebrow">${h(t.type)}</p><h2>${h(t.title)}</h2><p>${h(t.description||'Your next discovery starts here.')}</p><p class="helper">${h(service(t))}</p><form data-form="progress"><input type="hidden" name="titleId" value="${h(t.id)}"><h3>${h(name())}’s progress</h3><div class="form-grid"><label>Status<select name="status">${options(STATUS,p?.status||'watchlist')}</select></label><label>Track<select name="trackingIntent">${options(INTENT,p?.tracking_intent||'all')}</select></label></div><button class="primary">${p?'Save progress':`Save for ${h(name())}`}</button></form>
  <section class="detail-section"><h3>Artwork &amp; metadata</h3><div class="artwork-match">${detailImage?`<img src="${h(detailImage)}" alt="Poster for ${h(t.title)}">`:`<div class="tmdb-placeholder large">${icon(t.type)}</div>`}<div><p class="helper">${t.tmdb_id?`Matched to TMDB #${h(t.tmdb_id)}. You can refresh the artwork if needed.`:'No TMDB match yet. Couch Sloth can search and fill this automatically.'}</p><button class="secondary" type="button" data-tmdb-auto data-title-id="${h(t.id)}">${t.tmdb_id?'Refresh TMDB match':'Find artwork automatically'}</button></div></div><div id="tmdb-match-results"></div></section>
  <section class="detail-section"><h3>Seasons</h3><p class="helper">Check off seasons below; choose your overall status separately above.</p>${seasons.length?seasons.map(s=>{const watched=s.season_progress?.some(p=>p.profile_id===state.profile&&p.watched);return `<div class="season-row"><div><strong>Season ${s.season_number}</strong><small>${displayDate(s.release_date)}${s.release_date?' · manually recorded':''}</small></div><button class="${watched?'season-watched':'secondary'}" data-season="${s.id}" data-watched="${!watched}">${watched?'✓ Watched':'Mark watched'}</button></div>`;}).join(''):'<p class="helper">No season records yet. Add the ones you want to track.</p>'}<details><summary>Add or update a season</summary><form data-form="season"><input type="hidden" name="titleId" value="${h(t.id)}"><div class="form-grid"><label>Season number<input name="seasonNumber" type="number" min="1" max="200" required></label><label>Release date · optional<input name="releaseDate" type="date"></label></div><label>Source link · optional<input name="sourceUrl" type="url" placeholder="https://…"></label><button class="secondary">Save season</button></form></details></section>
  <section class="detail-section"><h3>Where to watch</h3>${t.streaming_availability?.length?t.streaming_availability.map(a=>`<div class="availability-row"><strong>${h(a.provider)}</strong><small>${h({available:'Available',upcoming:'Upcoming',unknown:'Unconfirmed'}[a.status])} · ${a.region}${a.release_date?` · ${displayDate(a.release_date)}`:''} · manually recorded</small></div>`).join(''):'<p class="helper">Streaming availability hasn’t been confirmed yet.</p>'}<details><summary>Add or update streaming details</summary><form data-form="availability"><input type="hidden" name="titleId" value="${h(t.id)}"><label>Streaming service<input name="provider" maxlength="120" placeholder="e.g. Netflix" required></label><div class="form-grid"><label>Availability<select name="status">${options({available:'Available now',upcoming:'Coming soon',unknown:'Unconfirmed'},'available')}</select></label><label>Release date · optional<input name="releaseDate" type="date"></label></div><label>Source link · optional<input name="sourceUrl" type="url" placeholder="https://…"></label><button class="secondary">Save streaming details</button></form></details></section>
  <section class="detail-section"><details><summary>Mood tags &amp; runtime</summary><form data-form="metadata"><input type="hidden" name="titleId" value="${h(t.id)}"><fieldset><legend>Moods</legend><div class="mood-checks">${Object.entries(MOODS).map(([id,label])=>`<label><input type="checkbox" name="moods" value="${id}" ${t.moods?.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset><label>Runtime in minutes · optional<input name="runtimeMinutes" type="number" min="1" max="600" value="${t.runtime_minutes||''}"></label><button class="secondary">Save mood details</button></form></details></section>
  <section class="detail-section"><h3>On the family’s lists</h3>${t.watch_progress?.length?t.watch_progress.map(p=>`<p class="family-saved"><strong>${h(state.profiles.find(x=>x.id===p.profile_id)?.name)}</strong><span>${STATUS[p.status]}</span></p>`).join(''):'<p class="helper">Be the first to save this one.</p>'}</section>`;
}
function matchesMarkup(titles){return titles.length?`<p class="helper">Already here? Open it and save it to your list.</p>${titles.map(t=>`<button class="existing-match" type="button" data-title="${h(t.id)}">${icon(t.type)} ${h(t.title)} <span>↗</span></button>`).join('')}`:'';}
function addForm(){
  const d=state.draft;const matches=d.title?state.titles.filter(t=>t.title.toLowerCase().includes(d.title.toLowerCase())).slice(0,5):[];
  return `<p class="eyebrow">DON’T LET THE GOOD ONES GET AWAY</p><h2>Add to your couch</h2><p class="helper">Add the title and Couch Sloth will automatically try to match it with TMDB for official artwork and metadata.</p><form data-form="add"><label>Title<input name="title" maxlength="120" value="${h(d.title)}" placeholder="What did your friend recommend?" required autocomplete="off"></label><div id="existing-matches">${matchesMarkup(matches)}</div><div class="form-grid"><label>Type<select name="type">${options({Series:'Series',Movie:'Movie',Documentary:'Documentary'},d.type)}</select></label><label>Track<select name="trackingIntent">${options(INTENT,d.trackingIntent)}</select></label></div><label>A little reminder · optional<textarea name="description" maxlength="4000" placeholder="Who recommended it? What caught your eye?">${h(d.description)}</textarea></label><div class="form-grid"><label>Runtime in minutes · optional<input name="runtimeMinutes" type="number" min="1" max="600" value="${h(d.runtimeMinutes)}"></label><label>Poster URL · optional<input name="posterUrl" type="url" placeholder="https://…" value="${h(d.posterUrl)}"></label></div><fieldset><legend>Mood tags · optional</legend><div class="mood-checks">${Object.entries(MOODS).map(([id,label])=>`<label><input type="checkbox" name="moods" value="${id}" ${d.moods.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset><p class="helper">Saves to ${h(name())}’s Watchlist. “Already watched some” lets you record watched seasons in title details.</p><button class="primary">Save to my watchlist</button></form>`;
}
function modal(){if(!state.modal)return '';return `<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="${state.modal==='add'?'Add a title':'Title and profile details'}"><button class="close-modal" data-close aria-label="Close">×</button>${state.modal==='add'?addForm():state.modal==='profiles'?`<h2>Whose couch?</h2><div class="profile-tabs">${state.profiles.map(p=>`<button data-profile="${p.id}">${p.name}</button>`).join('')}</div>`:details(titleById(state.modal))}<p class="form-message" role="status">${h(state.message)}</p></section></div>`;}
function render(){
  document.body.style.overflow=state.modal?'hidden':'';
  const focus=document.activeElement,focusId=focus?.id,selection=focus?.selectionStart;
  if(!state.profile)app.innerHTML=welcome();
  else app.innerHTML=`<div class="app-shell"><header class="topbar"><button class="brand" data-go="home"><span>🦥</span><strong>Couch Sloth<small>YOUR LITTLE WATCHING WORLD</small></strong></button><button class="profile-button" data-profiles><span>${name()[0]}</span>${h(name())} ⌄</button></header><main>${state.error?`<div class="connection-error" role="alert"><strong>We couldn’t reach your library.</strong><p>${h(state.error)}</p><button class="secondary" data-retry>Try again</button></div>`:''}${state.loading?'<div class="loading" role="status">Getting the couch ready…</div>':state.tab==='home'?home():state.tab==='coming'?coming():state.tab==='stuff'?stuff():pick()}<footer>One shared couch. Three separate lists.<span>${state.connected?'Synced with Supabase':'Connection unavailable'}</span><small class="tmdb-credit">This product uses the TMDB API but is not endorsed or certified by TMDB.</small></footer></main><button class="floating-add" data-add aria-label="Add a title">＋ <span>Add</span></button><nav class="bottom-nav" aria-label="Main navigation">${[['home','⌂','Home'],['coming','◷','Coming Soon'],['pick','✦','Sloth Pick'],['stuff','♡','My Stuff']].map(([id,symbol,label])=>`<button data-go="${id}" class="${state.tab===id?'active':''}" ${state.tab===id?'aria-current="page"':''}><span>${symbol}</span>${label}</button>`).join('')}</nav>${modal()}</div>`;
  bind();if(focusId){const field=document.getElementById(focusId);field?.focus();if(selection!=null&&field?.type==='text')field.setSelectionRange(selection,selection);}setBusy(state.busy);
}
let returnFocus;
function openModal(id){returnFocus=document.activeElement;state.modal=id;state.message='';if(id==='add')state.draft||={titleId:`custom-${crypto.randomUUID()}`,title:'',type:'Series',trackingIntent:'all',description:'',runtimeMinutes:'',posterUrl:'',moods:[]};render();document.querySelector('.modal input,.modal button')?.focus();}
function closeModal(){if(state.busy)return;state.modal=null;state.message='';render();if(returnFocus?.isConnected)returnFocus.focus();else document.querySelector('[data-add]')?.focus();}
function bindTitleButtons(root=document){root.querySelectorAll('[data-title]').forEach(b=>b.onclick=()=>openModal(b.dataset.title));}
function bind(){
  document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{state.profile=b.dataset.profile;state.pick.audience=[state.profile];state.viewing=null;state.modal=null;try{localStorage.setItem('couchsloth-profile',state.profile);}catch{/* device preference optional */}render();});
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.go;state.viewing=null;state.type='all';state.service='all';render();window.scrollTo({top:0,behavior:'smooth'});});
  document.querySelector('[data-profiles]')?.addEventListener('click',()=>openModal('profiles'));
  document.querySelector('[data-add]')?.addEventListener('click',()=>openModal('add'));
  document.querySelector('[data-close]')?.addEventListener('click',closeModal);
  document.querySelector('.modal-overlay')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  document.querySelector('[data-retry]')?.addEventListener('click',()=>load());bindTitleButtons();
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.viewing=b.dataset.view;render();});
  document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{state.status=b.dataset.status;render();});
  document.querySelector('#saved-search')?.addEventListener('input',e=>{state.search=e.target.value;render();});
  document.querySelectorAll('[data-filter]').forEach(el=>el.onchange=()=>{state[el.dataset.filter]=el.value;render();});
  document.querySelectorAll('[data-pick]').forEach(el=>el.onchange=()=>{state.pick[el.dataset.pick]=el.value;state.picked=null;state.pickMessage='';});
  document.querySelectorAll('[data-audience]').forEach(el=>el.onchange=()=>{state.pick.audience=el.checked?[...state.pick.audience,el.dataset.audience]:state.pick.audience.filter(id=>id!==el.dataset.audience);state.picked=null;});
  document.querySelectorAll('[data-pick-action]').forEach(b=>b.onclick=()=>{
    if(!state.pick.audience.length){state.picked=null;state.pickMessage='Choose who’s watching first.';render();return;}
    const candidates=chooseCandidates(state.titles,{...state.pick,chaos:b.dataset.pickAction==='chaos'});const alternatives=candidates.filter(t=>t.id!==state.picked);const pool=alternatives.length?alternatives:candidates;
    state.picked=pool.length?pool[Math.floor(Math.random()*pool.length)].id:null;state.pickMessage=pool.length?'':'No matches this time. Try another mood, broaden the library selection, or use Full Chaos.';render();
  });
  document.querySelectorAll('[data-season]').forEach(b=>b.onclick=()=>save({action:'seasonProgress',titleId:state.modal,seasonId:b.dataset.season,watched:b.dataset.watched==='true'}));
  document.querySelector('[data-tmdb-auto]')?.addEventListener('click',e=>autoArtwork(e.currentTarget.dataset.titleId));bindTmdbCandidateButtons();
  document.querySelectorAll('[data-form]').forEach(form=>{
    if(form.dataset.form==='add')form.addEventListener('input',()=>{const data=new FormData(form);state.draft={...state.draft,...Object.fromEntries(data),moods:data.getAll('moods')};const matches=state.draft.title?state.titles.filter(t=>t.title.toLowerCase().includes(state.draft.title.toLowerCase())).slice(0,5):[];const target=document.querySelector('#existing-matches');target.innerHTML=matchesMarkup(matches);bindTitleButtons(target);});
    form.addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(form));
      if(form.dataset.form==='add'){
        const existing=state.titles.find(t=>t.title.trim().toLowerCase()===String(data.title).trim().toLowerCase()&&t.type===data.type);
        if(existing){openModal(existing.id);state.message='This title is already here. Save it to your profile below.';render();return;}
        const newTitleId=state.draft.titleId;
        if(await save({action:'add',...state.draft})){await autoArtwork(newTitleId,{silent:true});await load(true);state.draft=null;state.modal=null;state.tab='stuff';state.status='watchlist';state.viewing=null;render();}
      }else await save({action:form.dataset.form,...data,...(form.dataset.form==='metadata'?{moods:new FormData(form).getAll('moods')}:{})});
    });
  });
}
// Dialogs retain focus, typed drafts, and their last failed submission.
// Background refresh never replaces an open form.
document.addEventListener('keydown',e=>{
  if(!state.modal)return;if(e.key==='Escape')closeModal();
  if(e.key==='Tab'){const items=[...document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal select:not(:disabled),.modal textarea:not(:disabled),.modal summary')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
window.addEventListener('focus',()=>{if(!state.modal)load(true);});
window.addEventListener('online',()=>load(true));
render();load();
