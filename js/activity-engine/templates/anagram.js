/* Template: Anagram — question.text is the answer word; question.hint or
   question.explanation (shown as a hint prompt) helps the student. Scored
   via activity-scoring.js's free-text fallback (answer compared to
   question.text, case/space-insensitive). */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['anagram'] = {
  renderQuestion(container, question, activity, onAnswer) {
    const answerWord = String(question.text || '').trim();
    const letters = shuffleArray(answerWord.split(''));

    container.innerHTML = `
      <div class="tpl-anagram">
        ${question.imageUrl ? `<img class="tpl-question-image" src="${question.imageUrl}" alt="">` : ''}
        ${question.hint ? `<div class="tpl-anagram-hint">Hint: ${escapeActivityHtml(question.hint)}</div>` : ''}
        <div class="tpl-anagram-answer" id="tplAnagramAnswer"></div>
        <div class="tpl-anagram-bank" id="tplAnagramBank"></div>
        <button class="tpl-clear-btn" id="tplAnagramClear">Clear</button>
      </div>`;

    const answerEl = container.querySelector('#tplAnagramAnswer');
    const bankEl = container.querySelector('#tplAnagramBank');
    let built = [];

    function renderTiles() {
      answerEl.innerHTML = '';
      built.forEach((l, i) => {
        const t = document.createElement('button');
        t.className = 'tpl-anagram-tile is-placed';
        t.textContent = l;
        t.onclick = () => { built.splice(i, 1); renderAll(); };
        answerEl.appendChild(t);
      });
    }

    function renderAll() {
      renderTiles();
      bankEl.innerHTML = '';
      const usedIndexes = new Set();
      const remaining = letters.slice();
      built.forEach(l => {
        const idx = remaining.indexOf(l);
        if (idx > -1) remaining.splice(idx, 1);
      });
      remaining.forEach((l) => {
        const t = document.createElement('button');
        t.className = 'tpl-anagram-tile';
        t.textContent = l;
        t.onclick = () => { built.push(l); renderAll(); };
        bankEl.appendChild(t);
      });
      if (built.length === answerWord.length) {
        setTimeout(() => onAnswer(built.join('')), 400);
      }
    }

    container.querySelector('#tplAnagramClear').onclick = () => { built = []; renderAll(); };
    renderAll();
  }
};
