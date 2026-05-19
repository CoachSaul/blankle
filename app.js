// ─── State ────────────────────────────────────────────────
let currentLevel   = 'A1';
let currentPuzzle  = null;
let focusedBlankId = null;
let isChecked      = false;

const TODAY = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

const LAUNCH_DATE = new Date('2026-05-20T00:00:00Z');

function getPuzzleNumber(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
  const utcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((utcMs - LAUNCH_DATE.getTime()) / 86400000) + 1;
}

// ─── DOM refs ─────────────────────────────────────────────
const headerDate     = document.getElementById('header-date');
const levelTabs      = document.querySelectorAll('.level-tab');
const loadingState   = document.getElementById('loading-state');
const errorState     = document.getElementById('error-state');
const puzzleContent  = document.getElementById('puzzle-content');
const puzzleTitle    = document.getElementById('puzzle-title');
const puzzleBadge    = document.getElementById('puzzle-level-badge');
const storyText      = document.getElementById('story-text');
const wordBankEl     = document.getElementById('word-bank');
const checkBtn       = document.getElementById('check-btn');
const resetBtn       = document.getElementById('reset-btn');
const resultsPanel   = document.getElementById('results-panel');
const scoreNumberEl  = document.getElementById('score-number');
const scoreDenomEl   = document.getElementById('score-denom');
const resultsLabelEl = document.getElementById('results-label');
const scoreBreakdown = document.getElementById('score-breakdown');
const shareBtn       = document.getElementById('share-btn');
const shareToast     = document.getElementById('share-toast');

// ─── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const d = new Date(TODAY + 'T00:00:00');
  headerDate.textContent = d.toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  levelTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.level === currentLevel) return;
      currentLevel = tab.dataset.level;
      levelTabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      loadPuzzle(TODAY, currentLevel);
    });
  });

  checkBtn.addEventListener('click', checkAnswers);
  resetBtn.addEventListener('click', resetPuzzle);
  shareBtn.addEventListener('click', shareResults);

  loadPuzzle(TODAY, currentLevel);
});

// ─── Load ─────────────────────────────────────────────────
async function loadPuzzle(date, level) {
  showState('loading');
  isChecked = false;
  currentPuzzle = null;
  focusedBlankId = null;

  try {
    const puzzle = await fetchPuzzle(date, level);
    currentPuzzle = puzzle;
    renderPuzzle(puzzle);
    const saved = loadResult(date, level);
    if (saved) restoreCompleted(puzzle, saved);
  } catch (err) {
    console.error('Puzzle load error:', err);
    showState('error');
  }
}

// ─── Render ───────────────────────────────────────────────
function renderPuzzle(puzzle) {
  puzzleTitle.textContent = puzzle.title || "Today's puzzle";
  puzzleBadge.textContent = puzzle.level;
  puzzleContent.classList.remove('completed');

  const blanks = extractBlanks(puzzle);
  storyText.innerHTML = buildStoryHTML(puzzle, blanks);

  document.querySelectorAll('.blank-input').forEach(inp => {
    inp.addEventListener('focus', () => { focusedBlankId = Number(inp.dataset.id); });
    inp.addEventListener('blur',  () => { setTimeout(() => { focusedBlankId = null; }, 220); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); moveFocus(inp, 1); }
    });
  });

  renderWordBank(blanks);
  resultsPanel.hidden = true;
  showState('puzzle');
}

// ─── Blank extraction (handles both story formats) ────────
//
// New format: puzzle.story is an array of {type:"text"|"blank", ...} segments.
// Old format: puzzle.story is a string; blanks live in puzzle.blanks.
// Normalised blank shape: { id, answer, base, pos, part, gender }
function extractBlanks(puzzle) {
  const story = puzzle.story;

  if (Array.isArray(story)) {
    return story
      .filter(s => s.type === 'blank')
      .map(s => ({
        id:     s.id,
        answer: s.answer,
        base:   s.base,
        pos:    s.pos,
        part:   s.part,
        gender: s.gender,
      }));
  }

  // Old format – normalise field names
  let raw = puzzle.blanks || [];
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = []; } }
  return raw.map(b => ({
    id:     b.id,
    answer: b.answer,
    base:   b.base   || b.base_form,
    pos:    b.pos    || b.pos_tag,
    part:   b.part,
    gender: b.gender,
  }));
}

// ─── Story HTML ───────────────────────────────────────────
function buildStoryHTML(puzzle, blanks) {
  const story = puzzle.story;

  if (Array.isArray(story)) {
    return story.map(seg => {
      if (seg.type === 'text')  return escapeHTML(seg.content).replace(/\n/g, '<br>');
      if (seg.type === 'blank') {
        const blank = blanks.find(b => b.id === seg.id);
        return blank ? inputHTML(blank) : '';
      }
      return '';
    }).join('');
  }

  // String format with [n] markers
  const byId = {};
  blanks.forEach(b => { byId[b.id] = b; });

  if (/\[\d+\]/.test(story)) {
    return story.split(/(\[\d+\])/g).map(part => {
      const m = part.match(/^\[(\d+)\]$/);
      if (!m) return escapeHTML(part).replace(/\n/g, '<br>');
      const blank = byId[Number(m[1])];
      return blank ? inputHTML(blank) : escapeHTML(part);
    }).join('');
  }

  // Fallback: sequential ___ markers
  let idx = 0;
  return story.split('___').map((seg, i, arr) => {
    const escaped = escapeHTML(seg).replace(/\n/g, '<br>');
    if (i < arr.length - 1) {
      const blank = blanks[idx++];
      return escaped + (blank ? inputHTML(blank) : '___');
    }
    return escaped;
  }).join('');
}

function inputHTML(blank) {
  const w = Math.max((blank.answer || '').length + 2, 5);
  return `<span class="blank-wrapper">\
<span class="blank-num">${blank.id}</span>\
<input class="blank-input" type="text"\
 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
 data-id="${blank.id}" style="width:${w}ch"\
 aria-label="Blank ${blank.id}">\
</span>`;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moveFocus(currentInput, dir) {
  const inputs = [...document.querySelectorAll('.blank-input:not([disabled])')];
  const i = inputs.indexOf(currentInput);
  const next = inputs[i + dir];
  if (next) next.focus();
}

// ─── Word Bank ────────────────────────────────────────────
function renderWordBank(blanks) {
  wordBankEl.innerHTML = '';

  blanks
    .slice()
    .sort((a, b) => a.base.localeCompare(b.base, 'de'))
    .forEach(blank => {
      const chip = document.createElement('button');
      chip.className = 'word-chip';
      chip.type = 'button';

      const word = document.createElement('span');
      word.className = 'chip-word';
      word.textContent = blank.base;
      chip.appendChild(word);


      chip.addEventListener('click', () => {
        if (focusedBlankId === null) return;
        const inp = document.querySelector(`.blank-input[data-id="${focusedBlankId}"]`);
        if (inp && !inp.disabled) { inp.value = blank.base; inp.focus(); inp.select(); }
      });

      wordBankEl.appendChild(chip);
    });
}

function posLabel(tag) {
  const map = {
    verb: 'Verb', noun: 'Nomen', adjective: 'Adj.', adverb: 'Adv.',
    preposition: 'Präp.', article: 'Art.', pronoun: 'Pron.',
    conjunction: 'Konj.', particle: 'Part.',
    // uppercase variants (old format)
    VERB: 'Verb', NOUN: 'Nomen', ADJ: 'Adj.', ADV: 'Adv.',
    ADP: 'Präp.', DET: 'Art.', PRON: 'Pron.', CONJ: 'Konj.',
    PART: 'Part.', AUX: 'Hilfsv.'
  };
  return map[tag] || tag;
}

function genderLabel(g) {
  const map = { m: 'der', f: 'die', n: 'das', pl: 'die' };
  return map[String(g).toLowerCase()] || g;
}

// ─── Scoring ──────────────────────────────────────────────
// Blanks with a truthy `part` field that share the same `base` are scored together.
function buildScoreGroups(blanks) {
  const groups = [];
  const sepMap = {};

  blanks.forEach(blank => {
    if (blank.part) {
      const key = blank.base;
      if (!sepMap[key]) {
        sepMap[key] = { type: 'separable', base: blank.base, blanks: [] };
        groups.push(sepMap[key]);
      }
      sepMap[key].blanks.push(blank);
    } else {
      groups.push({ type: 'single', base: blank.base, blanks: [blank] });
    }
  });

  return groups;
}

function computeScore(groups, userAnswers) {
  return groups.reduce((sum, g) => {
    return sum + (g.blanks.every(b => userAnswers[b.id] === b.answer) ? 1 : 0);
  }, 0);
}

// ─── Check Answers ────────────────────────────────────────
function checkAnswers() {
  if (!currentPuzzle || isChecked) return;

  const blanks = extractBlanks(currentPuzzle);
  const userAnswers = collectAnswers();

  blanks.forEach(blank => {
    const inp = document.querySelector(`.blank-input[data-id="${blank.id}"]`);
    if (!inp) return;
    const correct = userAnswers[blank.id] === blank.answer;
    inp.classList.add('checked');
    inp.classList.toggle('correct',   correct);
    inp.classList.toggle('incorrect', !correct);
    inp.disabled = true;
  });

  const groups   = buildScoreGroups(blanks);
  const score    = computeScore(groups, userAnswers);
  const maxScore = groups.length;

  saveResult(TODAY, currentLevel, { userAnswers, score, maxScore });

  isChecked = true;
  puzzleContent.classList.add('completed');
  showResults(score, maxScore, groups, userAnswers);
}

function collectAnswers() {
  const answers = {};
  document.querySelectorAll('.blank-input').forEach(inp => {
    answers[Number(inp.dataset.id)] = inp.value.trim();
  });
  return answers;
}

// ─── Show Results ─────────────────────────────────────────
function showResults(score, maxScore, groups, userAnswers) {
  scoreNumberEl.textContent = score;
  scoreDenomEl.textContent  = `/${maxScore}`;
  resultsLabelEl.textContent = scorePhrase(score, maxScore);

  scoreBreakdown.innerHTML = '';
  groups.forEach(group => {
    const allCorrect = group.blanks.every(b => userAnswers[b.id] === b.answer);
    scoreBreakdown.appendChild(buildBreakdownRow(group, userAnswers, allCorrect));
  });

  resultsPanel.hidden = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildBreakdownRow(group, userAnswers, allCorrect) {
  const row = document.createElement('div');
  row.className = 'breakdown-row';

  const icon = document.createElement('span');
  icon.className = 'bd-icon ' + (allCorrect ? 'correct' : 'incorrect');
  icon.textContent = allCorrect ? '✓' : '✗';
  row.appendChild(icon);

  const base = document.createElement('span');
  base.className = 'bd-base';
  base.textContent = group.base;
  row.appendChild(base);

  const arrow = document.createElement('span');
  arrow.className = 'bd-arrow';
  arrow.textContent = '→';
  row.appendChild(arrow);

  const answersEl = document.createElement('span');
  answersEl.className = 'bd-answers';

  group.blanks.forEach((blank, i) => {
    const given   = userAnswers[blank.id] || '—';
    const correct = given === blank.answer;

    if (i > 0) {
      const joiner = document.createElement('span');
      joiner.className = 'bd-sep-joiner';
      joiner.textContent = '+';
      answersEl.appendChild(joiner);
    }

    const givenEl = document.createElement('span');
    givenEl.className = 'bd-given ' + (correct ? 'correct' : 'incorrect');
    givenEl.textContent = given;
    answersEl.appendChild(givenEl);

    if (!correct) {
      const exp = document.createElement('span');
      exp.className = 'bd-expected';
      exp.textContent = `(${blank.answer})`;
      answersEl.appendChild(exp);
    }
  });

  row.appendChild(answersEl);

  if (group.type === 'separable' && group.blanks.length > 1) {
    const badge = document.createElement('span');
    badge.className = 'bd-tag';
    badge.textContent = 'separable';
    row.appendChild(badge);
  }

  return row;
}

function scorePhrase(score, max) {
  const pct = max > 0 ? score / max : 0;
  if (pct === 1)  return 'Perfect — all correct! 🎉';
  if (pct >= 0.8) return 'Really well done!';
  if (pct >= 0.6) return 'Good effort — keep practising.';
  if (pct >= 0.4) return 'Keep going — you\'ve got this!';
  return 'Don\'t give up — new puzzle tomorrow!';
}

// ─── Restore Completed ────────────────────────────────────
function restoreCompleted(puzzle, saved) {
  const blanks = extractBlanks(puzzle);

  blanks.forEach(blank => {
    const inp = document.querySelector(`.blank-input[data-id="${blank.id}"]`);
    if (!inp) return;
    inp.value = saved.userAnswers[blank.id] || '';
    const correct = inp.value === blank.answer;
    inp.classList.add('checked');
    inp.classList.toggle('correct',   correct);
    inp.classList.toggle('incorrect', !correct);
    inp.disabled = true;
  });

  isChecked = true;
  puzzleContent.classList.add('completed');

  const groups   = buildScoreGroups(blanks);
  const maxScore = groups.length;
  showResults(saved.score, maxScore, groups, saved.userAnswers);
}

// ─── Reset ────────────────────────────────────────────────
function resetPuzzle() {
  if (!currentPuzzle) return;

  document.querySelectorAll('.blank-input').forEach(inp => {
    inp.value = '';
    inp.classList.remove('checked', 'correct', 'incorrect');
    inp.disabled = false;
  });

  resultsPanel.hidden = true;
  puzzleContent.classList.remove('completed');
  isChecked = false;
  try { localStorage.removeItem(storageKey(TODAY, currentLevel)); } catch (_) {}
}

// ─── LocalStorage ─────────────────────────────────────────
function storageKey(date, level) { return `luckentext_${date}_${level}`; }

function saveResult(date, level, result) {
  try { localStorage.setItem(storageKey(date, level), JSON.stringify(result)); } catch (_) {}
}

function loadResult(date, level) {
  try {
    const raw = localStorage.getItem(storageKey(date, level));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ─── Share ────────────────────────────────────────────────
function shareResults() {
  if (!currentPuzzle) return;
  const saved = loadResult(TODAY, currentLevel);
  if (!saved) return;

  const { userAnswers, score, maxScore } = saved;
  const blanks  = extractBlanks(currentPuzzle);
  const groups  = buildScoreGroups(blanks);

  const d       = new Date(TODAY + 'T00:00:00');
  const dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const grid = groups.map(g =>
    g.blanks.every(b => userAnswers[b.id] === b.answer) ? '🟩' : '🟥'
  ).join('');

  const text = `🇩🇪 Cloze · ${dateStr} · ${currentLevel}\n${grid}\n${score}/${maxScore}`;

  const onCopied = () => {
    shareToast.textContent = '✓ Copied to clipboard!';
    setTimeout(() => { shareToast.textContent = ''; }, 3000);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onCopied).catch(() => fallbackCopy(text, onCopied));
  } else {
    fallbackCopy(text, onCopied);
  }
}

function fallbackCopy(text, onSuccess) {
  const ta = document.createElement('textarea');
  ta.value = text;
  Object.assign(ta.style, { position: 'fixed', top: '-9999px', opacity: '0' });
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); onSuccess(); } catch (_) {}
  document.body.removeChild(ta);
}

// ─── UI state ─────────────────────────────────────────────
function showState(state) {
  loadingState.hidden  = state !== 'loading';
  errorState.hidden    = state !== 'error';
  puzzleContent.hidden = state !== 'puzzle';
}
