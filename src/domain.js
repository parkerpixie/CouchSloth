export const STATUS = { watchlist:'Watchlist', watching:'Watching', caught_up:'Caught Up', finished:'Finished' };
export const INTENT = { all:'All seasons', latest:'Latest season', partial:'Already watched some' };
export const MOODS = { cozy:'Cozy', funny:'Funny', dark:'Dark', curious:'Curious', 'mind-bending':'Mind-bending' };
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function displayDate(value) {
  return value ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : 'Date not announced';
}
export function progressFor(title, id) { return title.watch_progress?.find(p=>p.profile_id===id) || null; }
export function isAvailable(title, today=todayKey()) {
  return title.streaming_availability?.some(a=>a.region==='US'&&a.status==='available'&&(!a.release_date||a.release_date<=today)) || false;
}
export function releases(titles) {
  return titles.flatMap(title=>[
    ...(title.seasons||[]).filter(s=>s.release_date).map(s=>({title,date:s.release_date,label:`Season ${s.season_number}`,source:s.metadata_source,provider:null})),
    ...(title.streaming_availability||[]).filter(a=>a.region==='US'&&a.release_date).map(a=>({title,date:a.release_date,label:a.provider,source:a.metadata_source,provider:a.provider})),
  ]).sort((a,b)=>a.date.localeCompare(b.date)||a.title.title.localeCompare(b.title.title));
}
export function chooseCandidates(titles, options, today=todayKey()) {
  return titles.filter(t=>{
    const audience=options.audience||[];
    if(audience.some(id=>['finished','caught_up'].includes(progressFor(t,id)?.status)))return false;
    const availability=(t.streaming_availability||[]).filter(a=>a.region==='US');
    if(availability.length&&availability.every(a=>a.status==='upcoming'&&(!a.release_date||a.release_date>today)))return false;
    if(t.seasons?.length&&t.seasons.every(s=>s.release_date&&s.release_date>today))return false;
    if(options.pool==='available'&&!isAvailable(t,today))return false;
    if(options.pool==='saved'&&!audience.some(id=>progressFor(t,id)))return false;
    if(!options.chaos&&options.mood!=='any'&&!t.moods?.includes(options.mood))return false;
    if(!options.chaos&&options.commitment==='short'&&(!t.runtime_minutes||t.runtime_minutes>35))return false;
    if(!options.chaos&&options.commitment==='movie'&&!(t.format==='film'||t.type==='Movie'))return false;
    if(!options.chaos&&options.commitment==='episodes'&&!(t.format==='series'||t.type==='Series'))return false;
    return true;
  });
}
export function escapeHtml(value) { return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
export function safeImage(value) {
  if(typeof value!=='string')return '';
  if(value.startsWith('data:image/jpeg;base64,')||value.startsWith('data:image/png;base64,'))return value;
  try{return new URL(value).protocol==='https:'?value:'';}catch{return '';}
}
