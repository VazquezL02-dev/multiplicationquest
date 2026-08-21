import './style.css'
import { supabase, cloudEnabled } from './lib/supabase.js'

const app = document.querySelector('#app')
const TEACHER_PIN = import.meta.env.VITE_TEACHER_PIN || '3983'
const STORAGE_KEY = 'multiply-masters-v1'

const classStudents = [
  'Isabelle','Malia','Addison','Simone','Prashish','Samuel','Samrat','Vincent','Josias','Logan',
  'Denise','Skylah','Elizabeth','Charlie','Vase','Brayden','Jordan','Miraya','Shayna','Felicia',
  'Juana','Lyn','Ithiel','Daniel','Dantae','Ollie','Oliver','Prisha','JayJay'
]

const state = {
  view: 'home',
  students: [],
  attempts: [],
  currentStudent: null,
  selectedTables: [2,3,4,5,6,7,8,9,10,11,12],
  duration: 60,
  question: null,
  answer: '',
  score: 0,
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  secondsLeft: 60,
  timer: null,
  feedback: '',
  teacherUnlocked: false,
  cloud: cloudEnabled,
  questionDeck: [],
  lastQuestionKey: null,
  dashboardRefreshTimer: null,
  lastSyncStatus: ''
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function loadLocal() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  const hasOldDemoRoster = saved.students?.length && saved.students.every(student => /^Student \d+$/.test(student.name))
  state.students = saved.students?.length && !hasOldDemoRoster
    ? saved.students
    : classStudents.map(name => ({ id: uid(), name, created_at: new Date().toISOString() }))
  state.attempts = saved.attempts || []
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ students: state.students, attempts: state.attempts }))
}

async function loadCloud() {
  if (!supabase) return
  const [{ data: students }, { data: attempts }] = await Promise.all([
    supabase.from('multiplication_students').select('*').order('name'),
    supabase.from('multiplication_attempts').select('*').order('created_at', { ascending: false })
  ])
  if (students?.length) {
    state.students = students
  } else {
    const seededStudents = classStudents.map(name => ({ id: uid(), name, created_at: new Date().toISOString() }))
    const { data: inserted, error } = await supabase.from('multiplication_students').insert(seededStudents).select('*')
    if (error) throw error
    state.students = inserted || seededStudents
  }
  if (attempts) {
    const pendingLocal = state.attempts.filter(a => a._pending_sync && !attempts.some(c => c.id === a.id))
    state.attempts = [...pendingLocal, ...attempts]
  }
}

async function initialise() {
  loadLocal()
  try {
    await retryPendingAttempts()
    await loadCloud()
  } catch (e) { console.warn('Using local mode', e) }
  render()
}

function shell(content) {
  app.innerHTML = `
    <header>
      <div>
        <h1>✖ Multiply Masters</h1>
        <p>Year 5 fluency challenge</p>
      </div>
      <button class="ghost" data-action="home">Home</button>
    </header>
    <main>${content}</main>
    <footer>${state.cloud ? 'Cloud data connected' : 'Local practice mode'} · Teacher PIN can be changed in .env</footer>
  `
}

function teacherShell(content) {
  app.innerHTML = `
    <div class="teacher-shell">
      <header>
        <div>
          <h1>✖ Multiply Masters</h1>
          <p>Teacher dashboard</p>
        </div>
        <button class="ghost" data-action="exit-teacher">Exit teacher view</button>
      </header>
      <main>${content}</main>
      <footer>${state.cloud ? 'Cloud data connected' : 'Local practice mode'} · Teacher view is separate from student play</footer>
    </div>
  `
}

function homeView() {
  shell(`
    <section class="hero card">
      <div>
        <span class="eyebrow">Fast facts. Strong strategies.</span>
        <h2>How many multiplication facts can you master?</h2>
        <p>Choose your name, select the tables you want to practise, and race the clock. Accuracy matters more than guessing.</p>
      </div>
      <div class="hero-actions">
        <button class="primary big" data-action="student-login">Student Play</button>
        <button class="secondary big" data-action="teacher-login">Teacher Dashboard</button>
      </div>
    </section>
    <section class="grid-3">
      <article class="card stat"><strong>${state.students.length}</strong><span>Students</span></article>
      <article class="card stat"><strong>${state.attempts.length}</strong><span>Rounds completed</span></article>
      <article class="card stat"><strong>${bestScore()}</strong><span>Top score</span></article>
    </section>
  `)
}

function studentLoginView() {
  const options = state.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
  shell(`
    <section class="card narrow">
      <h2>Choose your name</h2>
      <label>Student
        <select id="student-select"><option value="">Select your name...</option>${options}</select>
      </label>
      <button class="primary" data-action="student-continue">Continue</button>
      <p class="hint">Can’t see your name? Ask your teacher to add it in the dashboard.</p>
    </section>
  `)
}

function setupView() {
  const checks = [2,3,4,5,6,7,8,9,10,11,12].map(n => `
    <label class="table-chip"><input type="checkbox" value="${n}" ${state.selectedTables.includes(n) ? 'checked' : ''}> ×${n}</label>
  `).join('')
  shell(`
    <section class="card">
      <div class="between"><div><span class="eyebrow">Player</span><h2>${escapeHtml(state.currentStudent.name)}</h2></div><button class="ghost" data-action="change-student">Change</button></div>
      <h3>Choose tables</h3>
      <div class="chip-grid" id="table-choices">${checks}</div>
      <div class="quick-actions"><button class="ghost" data-action="select-all">All</button><button class="ghost" data-action="select-core">2, 3, 4, 5, 10</button><button class="ghost" data-action="clear-tables">Clear</button></div>
      <h3>Round length</h3>
      <div class="duration-row">
        ${[60,120,180].map(s => `<button class="duration ${state.duration===s?'active':''}" data-duration="${s}">${s/60} min</button>`).join('')}
      </div>
      <button class="primary big full" data-action="start-round">Start Challenge</button>
      ${studentStatsCard(state.currentStudent.id)}
    </section>
  `)
}

function gameView() {
  const accuracy = state.total ? Math.round((state.correct/state.total)*100) : 100
  shell(`
    <section class="game card">
      <div class="game-top">
        <div><span>Time</span><strong id="time">${state.secondsLeft}</strong></div>
        <div><span>Score</span><strong id="score">${state.score}</strong></div>
        <div><span>Accuracy</span><strong id="accuracy">${accuracy}%</strong></div>
        <div><span>Streak</span><strong id="streak">${state.streak}</strong></div>
      </div>
      <div class="progress"><div id="progress-bar" style="width:${(state.secondsLeft/state.duration)*100}%"></div></div>
      <div class="question" id="question">${state.question.a} × ${state.question.b} =</div>
      <input id="answer" class="answer" inputmode="numeric" autocomplete="off" autofocus value="${state.answer}" aria-label="Answer">
      <button class="primary" data-action="submit-answer">Submit</button>
      <div class="feedback" id="feedback">${state.feedback}</div>
      <p class="hint">Press Enter after each answer.</p>
    </section>
  `)
  setTimeout(() => document.querySelector('#answer')?.focus(), 0)
}

function resultsView(last) {
  const accuracy = last.total ? Math.round(last.correct / last.total * 100) : 0
  let message = accuracy >= 90 ? 'Outstanding accuracy!' : accuracy >= 75 ? 'Strong work—keep building speed.' : 'Keep practising carefully; accuracy comes first.'
  shell(`
    <section class="card result narrow">
      <span class="eyebrow">Round complete</span>
      <h2>${message}</h2>
      <div class="result-score">${last.score}</div><p>points</p>
      <div class="grid-3 compact">
        <div><strong>${last.correct}</strong><span>Correct</span></div>
        <div><strong>${accuracy}%</strong><span>Accuracy</span></div>
        <div><strong>${last.best_streak}</strong><span>Best streak</span></div>
      </div>
      <div class="sync-status">${escapeHtml(state.lastSyncStatus || (state.cloud ? 'Checking cloud save…' : 'Saved on this device only'))}</div>
      <button class="primary full" data-action="play-again">Play again</button>
      <button class="secondary full" data-action="home">Finish</button>
    </section>
  `)
}

function teacherLoginView() {
  shell(`
    <section class="card narrow">
      <h2>Teacher access</h2>
      <label>Teacher PIN<input id="teacher-pin" type="password" inputmode="numeric" placeholder="Enter PIN"></label>
      <button class="primary" data-action="unlock-teacher">Open dashboard</button>
      <p class="hint">Teacher PIN: 3983. You can change it later in your Vercel environment variables.</p>
    </section>
  `)
}

function teacherView() {
  const rows = leaderboard().map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.best}</td><td>${r.avgAccuracy}%</td><td>${r.bestFactsPerMin}</td><td>${r.lastDuration}</td><td>${r.rounds}</td><td>${r.last || '—'}</td></tr>`).join('')
  const recent = state.attempts.slice(0,30).map(a => {
    const s = state.students.find(x=>x.id===a.student_id)
    return `<tr><td>${escapeHtml(s?.name || 'Unknown')}</td><td>${a.score}</td><td>${formatDuration(a.duration_seconds)}</td><td>${a.accuracy}%</td><td>${a.correct}/${a.total}</td><td>${factsPerMinute(a)}</td><td>${formatDate(a.created_at)}</td></tr>`
  }).join('')
  teacherShell(`
    <section class="dashboard-head card teacher-only">
      <div><span class="eyebrow">Teacher dashboard</span><h2>Class multiplication fluency</h2><p>Compare accuracy and speed fairly across 1, 2 and 3 minute rounds. <strong>Live results refresh automatically.</strong></p></div>
      <div class="toolbar"><button class="secondary" data-action="export-csv">Export CSV</button><button class="ghost" data-action="refresh-data">Refresh</button></div>
    </section>
    <section class="grid-3 teacher-only">
      <article class="card stat"><strong>${state.attempts.length}</strong><span>Total rounds</span></article>
      <article class="card stat"><strong>${classAverage()}%</strong><span>Class accuracy</span></article>
      <article class="card stat"><strong>${activeToday()}</strong><span>Played today</span></article>
    </section>
    <section class="card teacher-only">
      <div class="between"><h3>Student progress</h3><span class="hint">Accuracy + facts per minute make different round lengths comparable</span></div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Student</th><th>Best score</th><th>Avg. accuracy</th><th>Best facts/min</th><th>Last time</th><th>Rounds</th><th>Last played</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No rounds yet.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card teacher-only">
      <h3>Recent attempts</h3>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Score</th><th>Time</th><th>Accuracy</th><th>Correct</th><th>Facts/min</th><th>Date</th></tr></thead><tbody>${recent || '<tr><td colspan="7">No attempts yet.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card teacher-only">
      <div class="between"><h3>Class roster</h3><button class="primary" data-action="add-student">Add student</button></div>
      <div class="roster">${state.students.map(s=>`<div class="roster-item"><span>${escapeHtml(s.name)}</span><div><button class="ghost small" data-edit="${s.id}">Edit</button><button class="danger small" data-delete="${s.id}">Remove</button></div></div>`).join('')}</div>
    </section>
  `)
}

function studentStatsCard(id) {
  const a = state.attempts.filter(x=>x.student_id===id)
  if (!a.length) return '<div class="mini-card"><strong>No rounds yet</strong><span>Your first score will appear here.</span></div>'
  const best = Math.max(...a.map(x=>x.score))
  const avg = Math.round(a.reduce((sum,x)=>sum+x.accuracy,0)/a.length)
  return `<div class="mini-card"><strong>Personal best: ${best}</strong><span>${a.length} rounds · ${avg}% average accuracy</span></div>`
}

function bestScore() { return state.attempts.length ? Math.max(...state.attempts.map(a=>a.score)) : 0 }
function classAverage() { return state.attempts.length ? Math.round(state.attempts.reduce((s,a)=>s+a.accuracy,0)/state.attempts.length) : 0 }
function activeToday() {
  const today = new Date().toDateString()
  return new Set(state.attempts.filter(a=>new Date(a.created_at).toDateString()===today).map(a=>a.student_id)).size
}
function factsPerMinute(a) {
  const seconds = Number(a.duration_seconds) || 60
  return Math.round(((Number(a.correct) || 0) / seconds) * 60 * 10) / 10
}
function formatDuration(seconds) {
  const total = Number(seconds) || 60
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return secs ? `${mins}:${String(secs).padStart(2,'0')}` : `${mins} min`
}
function leaderboard() {
  return state.students.map(s=>{
    const a=state.attempts.filter(x=>x.student_id===s.id)
    return {
      name:s.name,
      best:a.length?Math.max(...a.map(x=>x.score)):0,
      avgAccuracy:a.length?Math.round(a.reduce((sum,x)=>sum+x.accuracy,0)/a.length):0,
      bestFactsPerMin:a.length?Math.max(...a.map(factsPerMinute)):0,
      lastDuration:a.length?formatDuration(a[0].duration_seconds):'—',
      rounds:a.length,
      last:a.length?formatDate(a[0].created_at):''
    }
  }).sort((a,b)=>b.bestFactsPerMin-a.bestFactsPerMin || b.avgAccuracy-a.avgAccuracy || b.best-a.best)
}
function formatDate(v) { return new Date(v).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) }
function escapeHtml(s='') { return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }

function render() {
  clearInterval(state.timer)
  clearInterval(state.dashboardRefreshTimer)
  state.dashboardRefreshTimer = null
  if (state.view==='home') homeView()
  if (state.view==='student-login') studentLoginView()
  if (state.view==='setup') setupView()
  if (state.view==='game') gameView()
  if (state.view==='results') resultsView(state.attempts[0])
  if (state.view==='teacher-login') teacherLoginView()
  if (state.view==='teacher') { teacherView(); startTeacherAutoRefresh() }
}

function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildQuestionDeck() {
  const unique = new Map()
  for (const table of state.selectedTables) {
    for (let other = 1; other <= 12; other++) {
      const low = Math.min(table, other)
      const high = Math.max(table, other)
      const key = `${low}x${high}`
      if (!unique.has(key)) unique.set(key, { low, high, key })
    }
  }

  let deck = shuffle([...unique.values()]).map(item => {
    // Mix the orientation as well, while keeping the same multiplication fact unique.
    if (item.low !== item.high && Math.random() < 0.5) {
      return { a:item.high, b:item.low, answer:item.low*item.high, key:item.key }
    }
    return { a:item.low, b:item.high, answer:item.low*item.high, key:item.key }
  })

  // When a new cycle begins, do not put the last-seen fact first again.
  if (deck.length > 1 && state.lastQuestionKey && deck[0].key === state.lastQuestionKey) {
    const swapIndex = deck.findIndex((q, i) => i > 0 && q.key !== state.lastQuestionKey)
    if (swapIndex > 0) [deck[0], deck[swapIndex]] = [deck[swapIndex], deck[0]]
  }
  state.questionDeck = deck
}

function newQuestion() {
  if (!state.questionDeck.length) buildQuestionDeck()
  state.question = state.questionDeck.shift()
  state.lastQuestionKey = state.question.key
  state.answer=''
  state.feedback=''
}

function startRound() {
  if (!state.selectedTables.length) return alert('Choose at least one multiplication table.')
  state.score=0;state.correct=0;state.total=0;state.streak=0;state.bestStreak=0;state.secondsLeft=state.duration;state.questionDeck=[];state.lastQuestionKey=null
  newQuestion();state.view='game';render()
  state.timer=setInterval(()=>{
    state.secondsLeft--
    const time=document.querySelector('#time');if(time) time.textContent=state.secondsLeft
    const bar=document.querySelector('#progress-bar');if(bar) bar.style.width=`${(state.secondsLeft/state.duration)*100}%`
    if(state.secondsLeft<=0) finishRound()
  },1000)
}

function submitAnswer() {
  const input=document.querySelector('#answer')
  const value=Number(input?.value)
  if (!Number.isFinite(value) || input.value==='') return
  state.total++
  if(value===state.question.answer){state.correct++;state.streak++;state.bestStreak=Math.max(state.bestStreak,state.streak);state.score+=10+Math.min(state.streak,10);state.feedback='✓ Correct!'}
  else{state.streak=0;state.score=Math.max(0,state.score-2);state.feedback=`Not quite — ${state.question.a} × ${state.question.b} = ${state.question.answer}`}
  const accuracy=Math.round(state.correct/state.total*100)
  document.querySelector('#score').textContent=state.score
  document.querySelector('#accuracy').textContent=`${accuracy}%`
  document.querySelector('#streak').textContent=state.streak
  document.querySelector('#feedback').textContent=state.feedback
  newQuestion()
  setTimeout(()=>{
    const q=document.querySelector('#question');if(q) q.textContent=`${state.question.a} × ${state.question.b} =`
    const a=document.querySelector('#answer');if(a){a.value='';a.focus()}
    const f=document.querySelector('#feedback');if(f) f.textContent=''
  },500)
}

async function finishRound() {
  clearInterval(state.timer)
  const attempt={id:uid(),student_id:state.currentStudent.id,score:state.score,correct:state.correct,total:state.total,accuracy:state.total?Math.round(state.correct/state.total*100):0,best_streak:state.bestStreak,duration_seconds:state.duration,tables:state.selectedTables,created_at:new Date().toISOString(),_pending_sync:Boolean(supabase)}
  state.attempts.unshift(attempt)
  saveLocal()
  state.lastSyncStatus = supabase ? 'Saving to teacher dashboard…' : 'Saved on this device only — Supabase is not connected.'
  state.view='results'
  render()

  if (supabase) {
    try {
      await saveAttemptToCloud(attempt)
      attempt._pending_sync = false
      state.lastSyncStatus = '✓ Saved to teacher dashboard'
      saveLocal()
    } catch (e) {
      console.error('Could not save multiplication attempt to Supabase:', e)
      state.lastSyncStatus = '⚠ Saved on this iPad, but not synced to the teacher dashboard yet.'
      saveLocal()
    }
    if (state.view === 'results') render()
  }
}

async function saveAttemptToCloud(attempt) {
  const cloudAttempt = {
    id: attempt.id,
    student_id: attempt.student_id,
    score: attempt.score,
    correct: attempt.correct,
    total: attempt.total,
    accuracy: attempt.accuracy,
    best_streak: attempt.best_streak,
    duration_seconds: attempt.duration_seconds,
    tables: attempt.tables,
    created_at: attempt.created_at
  }
  await supabase.from('multiplication_attempts').insert(cloudAttempt)
}

async function retryPendingAttempts() {
  if (!supabase) return
  const pending = state.attempts.filter(a => a._pending_sync)
  for (const attempt of pending) {
    try {
      await saveAttemptToCloud(attempt)
      attempt._pending_sync = false
    } catch (e) {
      console.warn('Pending attempt still could not sync', e)
    }
  }
  if (pending.length) saveLocal()
}

async function addStudent(name) {
  const student={id:uid(),name:name.trim(),created_at:new Date().toISOString()}
  state.students.push(student);state.students.sort((a,b)=>a.name.localeCompare(b.name));saveLocal()
  if(supabase){try{await supabase.from('multiplication_students').insert(student)}catch(e){console.warn(e)}}
}
async function updateStudent(id,name){const s=state.students.find(x=>x.id===id);if(!s)return;s.name=name.trim();state.students.sort((a,b)=>a.name.localeCompare(b.name));saveLocal();if(supabase)await supabase.from('multiplication_students').update({name:s.name}).eq('id',id)}
async function deleteStudent(id){state.students=state.students.filter(s=>s.id!==id);saveLocal();if(supabase)await supabase.from('multiplication_students').delete().eq('id',id)}

function startTeacherAutoRefresh() {
  if (!supabase || state.view !== 'teacher') return
  state.dashboardRefreshTimer = setInterval(async () => {
    if (state.view !== 'teacher') return
    try {
      await loadCloud()
      if (state.view === 'teacher') teacherView()
    } catch (e) {
      console.warn('Teacher dashboard auto-refresh failed', e)
    }
  }, 5000)
}

function exportCsv(){
  const rows=[['Student','Score','Accuracy','Correct','Total','Best streak','Duration','Tables','Date']]
  for(const a of state.attempts){const s=state.students.find(x=>x.id===a.student_id);rows.push([s?.name||'Unknown',a.score,a.accuracy,a.correct,a.total,a.best_streak,a.duration_seconds,(a.tables||[]).join(' '),a.created_at])}
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')
  const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='multiply-masters-results.csv';link.click();URL.revokeObjectURL(url)
}

app.addEventListener('click',async e=>{
  const action=e.target.dataset.action
  if(action==='home'){state.view='home';render()}
  if(action==='student-login'){state.view='student-login';render()}
  if(action==='teacher-login'){state.currentStudent=null;state.view=state.teacherUnlocked?'teacher':'teacher-login';render()}
  if(action==='exit-teacher'){state.teacherUnlocked=false;state.currentStudent=null;state.view='home';render()}
  if(action==='student-continue'){const id=document.querySelector('#student-select').value;if(!id)return alert('Please choose your name.');state.currentStudent=state.students.find(s=>s.id===id);state.view='setup';render()}
  if(action==='change-student'){state.view='student-login';render()}
  if(action==='select-all'){state.selectedTables=[2,3,4,5,6,7,8,9,10,11,12];render()}
  if(action==='select-core'){state.selectedTables=[2,3,4,5,10];render()}
  if(action==='clear-tables'){state.selectedTables=[];render()}
  if(action==='start-round'){state.selectedTables=[...document.querySelectorAll('#table-choices input:checked')].map(x=>Number(x.value));startRound()}
  if(action==='submit-answer')submitAnswer()
  if(action==='play-again'){state.view='setup';render()}
  if(action==='unlock-teacher'){if(document.querySelector('#teacher-pin').value===TEACHER_PIN){state.teacherUnlocked=true;state.currentStudent=null;state.view='teacher';render()}else alert('Incorrect PIN')}
  if(action==='add-student'){const name=prompt('Student name');if(name){await addStudent(name);render()}}
  if(action==='export-csv')exportCsv()
  if(action==='refresh-data'){await loadCloud();render()}
  if(e.target.dataset.duration){state.duration=Number(e.target.dataset.duration);render()}
  if(e.target.dataset.edit){const s=state.students.find(x=>x.id===e.target.dataset.edit);const name=prompt('Edit student name',s.name);if(name){await updateStudent(s.id,name);render()}}
  if(e.target.dataset.delete){const s=state.students.find(x=>x.id===e.target.dataset.delete);if(confirm(`Remove ${s.name}? Their old scores will remain in reports.`)){await deleteStudent(s.id);render()}}
})

app.addEventListener('keydown',e=>{if(state.view==='game'&&e.key==='Enter')submitAnswer()})

initialise()
