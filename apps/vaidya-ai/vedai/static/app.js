const $ = id => document.getElementById(id);
const state = {sessions: [], activeSession: null, selectedTurn: null, runningSession: null, controller: null, ready: false};
const sessionStore=new SessionStore(()=>{
  $('storage-warning').hidden=false;
  $('storage-note').textContent='Storage unavailable. Sessions last only while this tab is open; they will be lost on refresh.';
});
const prompts = {
  symptoms: ['sar dard and pet kharab lag raha h patli tatti aa rahi h', ''],
  definition: ['How does Charaka define Ayurveda?', 'carakasamhita'],
  doshas: ['What are the three doshas in Ashtanga Hridaya?', 'astangahrdayasamhita'],
  health: ['How does Sushruta describe a healthy person?', 'susrutasamhita']
};
function node(tag, text, cls) { const el = document.createElement(tag); if(text !== undefined) el.textContent = text; if(cls) el.className = cls; return el; }
async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if(!response.ok) {
    const error=new Error(typeof payload.detail === 'string' ? payload.detail : 'The request could not be completed. Please check the question and filters.');
    error.status=response.status;throw error;
  }
  return payload;
}
function message(text, error=false) { $('message').textContent=text; $('message').className=error?'error':''; }
function busy(active) { $('submit').disabled=active; $('new-reading').disabled=active; $('submit-label').textContent=active?'Reading…':'Find passages'; $('stop').hidden=!active; $('question').setAttribute('aria-busy',String(active)); document.querySelectorAll('[data-prompt]').forEach(b=>b.disabled=active); }
function updateFilters() {
  const work=$('work').selectedOptions[0]?.textContent || 'All works';
  $('filter-summary').textContent=`${work} · ${$('answer-language').selectedOptions[0].textContent}`;
}
async function awaitReading(start, signal) {
  if(!start.job_id)return start;
  while(true) {
    const job=await request(`/jobs/${encodeURIComponent(start.job_id)}`,{signal});
    if(job.status==='complete')return job.result;
    if(job.status==='error'){const error=new Error(job.detail || 'The search could not finish.');error.finished=true;throw error;}
    await new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new DOMException('Stopped waiting','AbortError'));return;}
      const cancel=()=>{clearTimeout(timer);reject(new DOMException('Stopped waiting','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},1500);
      signal.addEventListener('abort',cancel,{once:true});
    });
  }
}
function readingView(view) {
  const sources=view==='sources';
  $('results').classList.toggle('sources-active',sources);
  $('show-answer').setAttribute('aria-pressed',String(!sources));
  $('show-sources').setAttribute('aria-pressed',String(sources));
}
$('show-answer').onclick=()=>readingView('answer');
$('show-sources').onclick=()=>readingView('sources');
function fitPopovers() {
  for(const [id,selector] of [['preferences','.filter-grid'],['query-plan','.plan-body']]) {
    const menu=$(id).querySelector(selector);
    if(id==='query-plan' && !matchMedia('(max-width:600px)').matches) { menu.style.maxHeight='';continue; }
    if($(id).open)menu.style.maxHeight=`${Math.max(60,innerHeight-menu.getBoundingClientRect().top-16)}px`;
  }
}
for(const id of ['preferences','query-plan'])$(id).addEventListener('toggle',fitPopovers);
let narrowLayout=matchMedia('(max-width:600px)').matches;
window.addEventListener('resize',()=>{
  const next=matchMedia('(max-width:600px)').matches;
  if(next && !narrowLayout)$('query-plan').open=false;
  narrowLayout=next;fitPopovers();
});
// Keep popovers from covering the reading area after choosing or submitting.
document.addEventListener('click',event=>{
  for(const id of ['preferences']) {
    if(!$(id).contains(event.target))$(id).open=false;
  }
  if(matchMedia('(max-width:600px)').matches && !$('query-plan').contains(event.target))$('query-plan').open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape') for(const id of ['preferences','query-plan']) {
    if($(id).open) { if($(id).contains(document.activeElement))$(id).querySelector('summary').focus(); $(id).open=false; }
  }
});
let toastTimer;
function toast(text) { clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3000); }
async function copySource(source, devanagari=false) {
  try { await navigator.clipboard.writeText(devanagari?source.sanskrit_devanagari:source.sanskrit);toast(devanagari?'Devanagari Sanskrit copied.':'Original Sanskrit copied.'); }
  catch { toast('Copy is unavailable in this browser. Open source details to select the text.'); }
}
function modelName(model) {
  return {'openai/gpt-5.6-sol':'GPT 5.6 Sol','openai/gpt-5.6-luna':'GPT 5.6 Luna'}[model] || model || 'Local retrieval';
}
function sanskritBlock(source) {
  const block=node('section',undefined,'sanskrit-scripts');
  const devanagari=source.sanskrit_devanagari;
  block.append(node('p',devanagari?'संस्कृत · देवनागरी':'Original indexed text','script-label'));
  const quote=node('blockquote',devanagari || source.sanskrit,'devanagari-text');
  quote.lang=devanagari?'sa-Deva':source.language || 'sa';block.append(quote);
  if(source.devanagari_method==='iast_transliteration') {
    block.append(node('p','Script converted from IAST; wording has not been translated.','script-note'));
    const original=node('details',undefined,'original-script');
    original.append(node('summary','Indexed Sanskrit · Latin / IAST'));
    const text=node('blockquote',source.sanskrit);text.lang='sa-Latn';original.append(text);block.append(original);
  }
  return block;
}
function translationBlock(source) {
  const block=node('section',undefined,'source-translation');
  const translation=source.translation;
  const language={en:'English',hi:'Hindi',sa:'Sanskrit'}[translation?.language] || '';
  block.append(node('p',translation?.language==='sa'?'AI EXPLANATION · SANSKRIT':`AI TRANSLATION${language?' · '+language.toUpperCase():''}`,'eyebrow'));
  if(translation?.status==='generated' && translation.text) {
    const text=node('p',translation.text,'translation-text');text.lang=translation.language;block.append(text);
    block.append(node('p',`${modelName(translation.model)} · Not expert-reviewed.`,'translation-note'));
  } else {
    block.append(node('p',translation?.status==='unavailable'?'A reliable translation could not be generated for this passage.':'Translation is not available for this reading. Run a generated search to include translations.','translation-note'));
  }
  return block;
}
function locationText(source) { return source.sections.map(s=>s.heading || `${s.subtype || s.type || 'Section'} ${s.n || ''}`).filter(Boolean).join(' / '); }
function sourceLocation(source) {
  const box=node('div',undefined,'source-location');
  const sectionType=s=>`${s.type || ''} ${s.subtype || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const book=source.sections.find(s=>/part|sthana|book|level1\b/.test(sectionType(s)));
  const chapter=source.sections.find(s=>/chapter|adhyaya|level2\b/.test(sectionType(s)));
  const locator=source.verse_label || source.references.flatMap(r=>r.xml_ids)[0];
  for(const [label,value] of [['Book / sthāna',book?.n || 'Not numbered in source'],['Chapter',chapter?.n || 'Not numbered in source'],[source.form==='shloka'?'Verse / source locator':'Passage locator',locator || 'Unnumbered · XML location available']]) {
    const field=node('div',undefined,'locator');field.append(node('span',label),node('strong',value));box.append(field);
  }
  return box;
}
function editionNote(source) {
  const pages=[...new Set(source.references.map(r=>r.page).filter(Boolean))];
  const revision=source.source_url?.match(/\/blob\/([a-f0-9]{40})\//)?.[1];
  return `Indexed SARIT edition${revision?' · '+revision.slice(0,10):''} · ${pages.length?'Source page markers: '+pages.join(', '):'Printed page mapping unavailable'}`;
}
const basisLabels={
  en:{textual:'Direct textual evidence',interpretation:'Interpretation of the text',general_knowledge:'General knowledge · not corpus-verified',modern_context:'Modern context · not source-verified',clinical_priority:'Clinical priority',evidence_gap:'Evidence gap',follow_up:'What would change the decision'},
  hi:{textual:'सीधे मूल पाठ में',interpretation:'पाठ से व्याख्या',general_knowledge:'सामान्य जानकारी · संग्रह से सत्यापित नहीं',modern_context:'आधुनिक संदर्भ · स्रोत-सत्यापित नहीं',clinical_priority:'चिकित्सकीय प्राथमिकता',evidence_gap:'प्रमाण की सीमा',follow_up:'निर्णय के लिए अगला प्रश्न'}
};
function renderFindings(result) {
  if(!result.findings?.length)return;
  const hi=result.answer_language==='hi';
  const block=node('details',undefined,'case-findings');
  block.append(node('summary',hi?'रोगी की जानकारी: उपलब्ध, अनुपस्थित और अज्ञात':'Case details: present, absent and unknown'));
  for(const status of ['present','absent','unknown']) {
    const rows=result.findings.filter(f=>f.state===status);if(!rows.length)continue;
    const group=node('section');
    group.append(node('h4',(hi?{present:'बताया गया',absent:'स्पष्टतः अनुपस्थित',unknown:'जानकारी नहीं मिली'}:{present:'Reported present',absent:'Explicitly absent',unknown:'Not established'})[status]));
    const list=node('ul');rows.forEach(f=>{const item=node('li',f.text);if(f.question_quote)item.title=f.question_quote;list.append(item);});
    group.append(list);block.append(group);
  }
  $('answer').append(block);
}
function renderPlan(plan, result) {
  $('query-plan').hidden=!plan;
  if(!plan)return;
  $('plan-queries').replaceChildren();
  $('plan-status').textContent=plan.status==='enhanced'?'AI-enhanced search':plan.status==='local_fallback'?'Local search fallback':'Local vocabulary search';
  plan.queries.forEach(query=>{
    const card=node('article',undefined,'plan-card');card.append(node('span',query.id,'query-id'),node('h3',query.topic));
    const terms=node('div',undefined,'search-terms');query.terms.forEach(term=>terms.append(node('span',term,'search-term')));card.append(terms);
    const count=query.retrieved_chunks || 0;
    const support=result.evidence_status==='supported'?` · ${query.cited_passages || 0} cited passages`:'';
    card.append(node('p',`${count} retrieved chunks${support}`,'plan-coverage'));$('plan-queries').append(card);
  });
  $('plan-note').textContent=(plan.original_retrieved_chunks!==undefined?'Your original wording was also searched. ':'')+(plan.source_guides?.length?`${plan.source_guides.length} source-navigation guides also checked adjacent passages. `:'')+'These topics guide retrieval; a match is not a diagnosis or proof that a passage answers your question.';
}
async function openSource(source) {
  $('dialog-title').textContent=source.title;
  $('dialog-meta').textContent=`${source.form === 'shloka' ? 'Śloka '+(source.verse_label || '(unnumbered in source)') : 'Prose / commentary'} · ${source.layer} · ${locationText(source)} · ${editionNote(source)}`;
  $('dialog-sanskrit').replaceChildren(sanskritBlock(source));
  $('dialog-translation').replaceChildren(translationBlock(source));
  $('dialog-location').replaceChildren(...sourceLocation(source).children);
  $('dialog-references').textContent=JSON.stringify(source.references,null,2);
  $('dialog-link').href=source.source_url;
  $('source-dialog').showModal();
}
function render(result) {
  document.body.classList.add('result-mode'); $('empty').hidden=true; $('results').hidden=false;
  readingView('answer');$('preferences').open=false;
  $('query-plan').open=matchMedia('(min-width:601px)').matches;
  $('new-reading').hidden=false; $('composer-heading').textContent='FOLLOW YOUR NEXT QUESTION';
  $('result-question').textContent=result.question; $('answer').replaceChildren(); $('evidence').replaceChildren();
  $('model-label').textContent=modelName(result.model)+(result.reasoning_effort?` · ${result.reasoning_effort}`:'');
  renderPlan(result.query_plan,result);
  if(result.claims.length) {
    const isGeneral=result.evidence_status==='general_knowledge';
    const mixed=result.claims.some(c=>c.basis && !['textual','interpretation'].includes(c.basis));
    const origin=isGeneral?'GENERAL KNOWLEDGE · NO VERIFIED CORPUS REFERENCE':result.evidence_status==='insufficient_evidence'?'LIMITED EVIDENCE':mixed?'TEXTUAL EVIDENCE + SEPARATE CLINICAL CONTEXT':'CORPUS ANSWER · SOURCE REFERENCES CHECKED';
    $('answer').append(node('p',origin,isGeneral?'answer-origin general':'answer-origin'));
    result.claims.forEach(claim=>{
      const section=node('section',undefined,claim.basis==='clinical_priority'?'answer-section clinical-priority':'answer-section');
      if(claim.basis) {
        section.dataset.basis=claim.basis;
        section.append(node('p',(basisLabels[result.answer_language]||basisLabels.en)[claim.basis],'basis-label'));
        section.append(node('h3',claim.heading));
      }
      const p=node('p',claim.text,'claim');
      [...new Set(claim.evidence.map(e=>e.citation_id))].forEach(id=>{
        const button=node('button',id,'cite');button.type='button';button.setAttribute('aria-label',`Read source ${id}`);
        button.onclick=()=>{
          readingView('sources');
          const target=$(`source-${id}`),reader=$('evidence');
          reader.scrollTo({top:reader.scrollTop+target.getBoundingClientRect().top-reader.getBoundingClientRect().top-12,behavior:'instant'});
          target.tabIndex=-1;target.focus({preventScroll:true});
        };p.append(button);
      });section.append(p);$('answer').append(section);
    });
    renderFindings(result);
    $('answer-note').textContent=isGeneral?'The model answered from general knowledge because the retrieved corpus did not support this answer. No book, shloka, or match percentage is claimed.':'Source IDs are checked and Sanskrit is copied directly from the indexed edition. Translations and interpretation are AI-generated and need review; the match score is query-term overlap, not confidence.';
  } else {
    const texts={not_configured:'The passages are ready to read. Generated answers will be available when OpenRouter is connected.',disabled:'Explore the original passages alongside your question.',rejected:'The answer did not pass citation checks. The retrieved passages remain available to read.',error:'Answer generation was unavailable. The retrieved passages remain available to read.'};
    const text=result.evidence_status==='insufficient_evidence'?'The available evidence is not sufficient to answer this question. Try a more specific question or another work.':(texts[result.generation_status]||'Read the retrieved passages to explore this question.');
    $('answer').append(node('p',text));
    $('answer-note').textContent=result.citations.length?'Retrieval suggests relevant passages; it does not establish that they answer the question.':'';
  }
  $('evidence-count').textContent=`${result.citations.length} source passage${result.citations.length===1?'':'s'}`;
  $('source-tab-count').textContent=result.citations.length;
  if(!result.citations.length) $('evidence').append(node('p',result.evidence_status==='general_knowledge'?'No verified book or shloka citation is available for this general-knowledge answer.':'No source passage is cited for this answer.','muted'));
  result.citations.forEach(source=>{
    const article=node('article',undefined,'source');article.id=`source-${source.citation_id}`;
    const top=node('div',undefined,'source-top');top.append(node('span',source.citation_id,'source-id'),node('h3',source.title));article.append(top);
    article.append(node('p',`${source.form==='shloka'?'Original shloka / verse group':source.form==='commentary'?'Commentary passage':'Prose passage'} · ${source.kind === 'base-text'?'Base text':source.layer} · ${source.language}`,'layer'));
    article.append(sourceLocation(source));
    article.append(node('p',editionNote(source),'edition-note'));
    if(source.search_topics?.length)article.append(node('p','Retrieved for: '+source.search_topics.join(' · '),'layer'));
    if(typeof source.match_percent==='number') {
      const match=node('details',undefined,'match-details');match.append(node('summary',`${source.match_percent.toFixed(1)}% query-term match`));
      match.append(node('p',source.match_method,'small muted'));match.append(node('p',`Matched ${source.matched_terms.length} of ${source.query_term_count} terms: ${source.matched_terms.join(', ')}`,'small'));article.append(match);
    }
    if(source.quote_verified) article.append(node('p',source.devanagari_method==='iast_transliteration'?'Citation checked against indexed text · Devanagari rendering below':'Original Sanskrit copied from the indexed edition','verified'));
    article.append(sanskritBlock(source));
    article.append(translationBlock(source));
    const loc=node('p',locationText(source),'location');
    const ids=source.references.flatMap(r=>r.xml_ids); if(ids.length) loc.append(node('span',ids.slice(0,4).join(' · ')+(ids.length>4?' …':'')));article.append(loc);
    const actions=node('div',undefined,'source-actions');
    const button=node('button','Open source details ↗');button.type='button';button.onclick=()=>openSource(source);actions.append(button);
    if(source.sanskrit_devanagari) {
      const devanagari=node('button','Copy देवनागरी','copy-devanagari');devanagari.type='button';devanagari.setAttribute('aria-label',`Copy Devanagari Sanskrit from ${source.citation_id}`);devanagari.onclick=()=>copySource(source,true);actions.append(devanagari);
    }
    const copy=node('button','Copy Sanskrit','copy-source');copy.type='button';copy.setAttribute('aria-label',`Copy Sanskrit from ${source.citation_id}`);copy.onclick=()=>copySource(source);actions.append(copy);
    article.append(actions);$('evidence').append(article);
  });
  $('timing').textContent=result.timing?`Search ${result.timing.retrieval_seconds.toFixed(2)}s · Total ${result.timing.total_seconds.toFixed(1)}s`:'';
  document.querySelector('.answer-scroll').scrollTop=0;$('evidence').scrollTop=0;
}
function clearReading() {
  document.body.classList.remove('result-mode');$('question').value='';$('results').hidden=true;$('query-plan').hidden=true;$('empty').hidden=false;$('new-reading').hidden=true;$('composer-heading').textContent='ASK THE COLLECTION';message('');$('question').focus();
  state.selectedTurn=null;
}
function currentSession() {return state.sessions.find(session=>session.id===state.activeSession);}
function rememberSession() {try {sessionStorage.setItem('vedai-active-session',state.activeSession);} catch { /* Browsing still works without tab storage. */ }}
function answerText(result) {return result.claims?.map(claim=>[claim.heading,claim.text].filter(Boolean).join('\n')).join('\n\n') || 'Original passages retrieved. Open the reading to explore the sources.';}
function settings() {return {answer_language:$('answer-language').value,allow_general_knowledge:$('allow-general').checked,filters:{work:$('work').value||null,kind:$('kind').value||null}};}
function restoreSettings(value) {
  if(!value)return;
  $('answer-language').value=value.answer_language;$('allow-general').checked=value.allow_general_knowledge;
  $('work').value=value.filters.work||'';$('kind').value=value.filters.kind||'';updateFilters();
}
function showTurn(turn) {
  state.selectedTurn=turn.id;$('question').value='';restoreSettings(turn.settings);
  if(turn.result)render(turn.result);
  else {clearReading();state.selectedTurn=turn.id;$('question').value=turn.question;message(turn.error || 'This reading is unfinished. Open Sessions to resume waiting.');}
}
function selectSession(id) {
  state.activeSession=id;rememberSession();clearReading();
  const session=currentSession(),last=session?.turns.at(-1);
  if(last)showTurn(last);
  else restoreSettings({answer_language:'en',allow_general_knowledge:true,filters:{work:null,kind:null}});
  $('rename-form').hidden=true;$('delete-confirm').hidden=true;renderSessions();
}
async function refreshSessions() {state.sessions=await sessionStore.all();renderSessions();}
async function createSession() {
  const session={id:crypto.randomUUID(),title:'New session',renamed:false,created:Date.now(),updated:Date.now(),turns:[]};
  await sessionStore.change(session.id,()=>session);await refreshSessions();selectSession(session.id);
}
async function saveTurn(sessionId,turn) {
  const saved=await sessionStore.change(sessionId,session=>{
    if(!session)return; // A session deleted in another tab must not be resurrected.
    const index=session.turns.findIndex(item=>item.id===turn.id);
    if(index<0)session.turns.push(turn);else session.turns[index]=turn;
    session.updated=Date.now();
    if(!session.renamed)session.title=session.turns[0].question.slice(0,80);
    return session;
  });
  await refreshSessions();
  return !!saved;
}
function renderSessions() {
  const session=currentSession();
  $('active-session').textContent=session?.title || 'New session';$('active-session').title=session?.title || 'New session';
  $('session-list').replaceChildren();
  for(const item of state.sessions) {
    const button=node('button',undefined,'session-item');button.type='button';button.dataset.sessionId=item.id;
    button.setAttribute('aria-pressed',String(item.id===state.activeSession));
    button.append(node('strong',item.title),node('span',`${item.turns.length} reading${item.turns.length===1?'':'s'} · ${new Date(item.updated).toLocaleDateString()}`));
    button.onclick=()=>selectSession(item.id);$('session-list').append(button);
  }
  $('session-title').textContent=session?.title || 'New session';$('session-turns').replaceChildren();
  $('delete-session').disabled=!session || state.runningSession===session.id;
  $('rename-session').disabled=!session;
  if(!session?.turns.length)$('session-turns').append(node('p','A fresh page. Ask a question to begin this conversation.','session-empty'));
  for(const turn of session?.turns || []) {
    const article=node('article',undefined,'chat-turn');article.dataset.turnId=turn.id;
    const question=node('div',undefined,'chat-question');question.append(node('span','YOU','eyebrow'),node('p',turn.question));article.append(question);
    const response=node('div',undefined,'chat-answer');response.append(node('span','VAIDYA AI','eyebrow'));
    if(turn.result) {
      const detail=node('details',undefined,'chat-answer-text');detail.append(node('summary',answerText(turn.result).slice(0,180)),node('p',answerText(turn.result)));response.append(detail);
      const open=node('button','Open reading & Sanskrit ↗','open-reading');open.type='button';open.onclick=()=>{showTurn(turn);$('sessions-dialog').close();message('Saved reading. New questions continue from this session’s latest readings.');};response.append(open);
    } else {
      response.append(node('p',turn.error || (turn.status==='pending'?'Reading in progress…':'This reading is unfinished.')));
      if(turn.job_id && turn.status!=='error') {
        const resume=node('button','Resume waiting','resume-reading');resume.type='button';resume.disabled=!!state.controller;
        resume.onclick=()=>{showTurn(turn);$('sessions-dialog').close();runReading(session.id,turn,true);};response.append(resume);
      }
    }
    article.append(response);$('session-turns').append(article);
  }
}
async function openSessions() {await refreshSessions();if(!currentSession()) {if(state.sessions.length)selectSession(state.sessions[0].id);else await createSession();}$('sessions-dialog').showModal();}
$('open-sessions').onclick=openSessions;$('active-session').onclick=openSessions;
$('close-sessions').onclick=()=>$('sessions-dialog').close();
$('create-session').onclick=async()=>{await createSession();$('sessions-dialog').close();$('question').focus();};
$('continue-session').onclick=()=>{$('sessions-dialog').close();$('question').value='';$('question').focus();};
$('rename-session').onclick=()=>{$('delete-confirm').hidden=true;$('rename-form').hidden=false;$('session-name').value=currentSession().title;$('session-name').focus();$('session-name').select();};
$('cancel-rename').onclick=()=>{$('rename-form').hidden=true;};
$('rename-form').onsubmit=async event=>{
  event.preventDefault();const name=$('session-name').value.trim();if(!name)return;
  await sessionStore.change(state.activeSession,session=>session?{...session,title:name,renamed:true}:undefined);
  $('rename-form').hidden=true;await refreshSessions();
};
$('delete-session').onclick=()=>{$('rename-form').hidden=true;$('delete-confirm').hidden=false;$('cancel-delete').focus();};
$('cancel-delete').onclick=()=>{$('delete-confirm').hidden=true;};
$('confirm-delete').onclick=async()=>{
  const id=state.activeSession;if(id===state.runningSession)return;
  await sessionStore.change(id,()=>undefined);await refreshSessions();
  if(state.sessions.length)selectSession(state.sessions[0].id);else await createSession();
};
$('new-reading').onclick=()=>{if(!state.controller)clearReading();};
for(const id of ['work','kind','answer-language'])$(id).addEventListener('change',updateFilters);
async function runReading(sessionId,turn,resume=false,conversation=[]) {
  if(state.controller)return;
  $('preferences').open=false;$('query-plan').open=false;
  state.controller=new AbortController();state.runningSession=sessionId;state.selectedTurn=turn.id;busy(true);
  message(resume?'Reconnecting to your reading…':'Unpacking your question, searching the collection, and checking source quotations…');
  try {
    turn.status='pending';delete turn.error;
    if(!await saveTurn(sessionId,turn))throw new Error('This session was deleted in another tab. Start a new session to continue.');
    const started=resume?{job_id:turn.job_id}:await request('/ask',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'respond-async'},signal:state.controller.signal,body:JSON.stringify({question:turn.question,...turn.settings,conversation})});
    if(started.job_id){turn.job_id=started.job_id;await saveTurn(sessionId,turn);}
    turn.result=await awaitReading(started,state.controller.signal);turn.status='complete';delete turn.job_id;
    await saveTurn(sessionId,turn);
    if(state.activeSession===sessionId && state.selectedTurn===turn.id){render(turn.result);$('question').value='';message('');}
    else toast('Your reading is ready in Sessions.');
  } catch(error) {
    turn.status=error.name==='AbortError' || (turn.job_id && error.status!==404 && !error.finished)?'interrupted':'error';
    turn.error=error.name==='AbortError'?(turn.job_id?'Stopped waiting. The server may still finish; resume this reading from Sessions.':'Stopped before a reading ID was received. The server may still finish; check before submitting again.'):error.message;
    await saveTurn(sessionId,turn);
    if(state.activeSession===sessionId && state.selectedTurn===turn.id)message(turn.error,error.name!=='AbortError');
  } finally {state.controller=null;state.runningSession=null;busy(false);renderSessions();}
}
$('ask-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.controller || !state.ready)return;
  const question=$('question').value.trim();if(!question){$('question').focus();return;}
  // Full answers and exact citations stay in browser storage. Only bounded text
  // summaries from this session travel with a follow-up request.
  const conversation=currentSession().turns.filter(turn=>turn.result).slice(-4).map(turn=>({question:turn.question,answer:answerText(turn.result).slice(0,2000)}));
  const turn={id:crypto.randomUUID(),question,settings:settings(),created:Date.now(),status:'pending'};
  await runReading(state.activeSession,turn,false,conversation);
});
$('stop').onclick=()=>state.controller?.abort();
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){$('ask-form').requestSubmit();}});
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{const [q,w]=prompts[button.dataset.prompt];$('question').value=q;$('work').value=w;$('kind').value=button.dataset.prompt==='symptoms'?'':'base-text';updateFilters();$('ask-form').requestSubmit();}));
$('close-dialog').onclick=()=>$('source-dialog').close();
busy(true);$('stop').hidden=true;
Promise.all([request('/works'),request('/health'),sessionStore.open()]).then(async([works,health,sessions])=>{
  works.forEach(w=>{const option=node('option',w.title);option.value=w.id;$('work').append(option);});$('work-count').textContent=works.length;
  $('connection').textContent=health.status==='ready'?'Local library ready':'Preparing the search index';
  $('model-label').textContent=health.generation_configured?modelName(health.generation_model)+(health.reasoning_effort?` · ${health.reasoning_effort}`:''):'Local retrieval';
  state.sessions=sessions;let saved;try {saved=sessionStorage.getItem('vedai-active-session');} catch { /* Storage can be unavailable. */ }
  if(sessions.length)selectSession(sessions.find(session=>session.id===saved)?.id || sessions[0].id);else await createSession();
  state.ready=true;busy(false);$('open-sessions').disabled=false;$('active-session').disabled=false;
  if(health.status!=='ready')message('The search index is being prepared. Please try again when indexing is complete.');
}).catch(error=>message(error.message,true));
