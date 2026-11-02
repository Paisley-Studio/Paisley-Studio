/* Template: Unjumble — question.text is the correct sentence; words are
   scrambled and the student taps them in order. Scored via
   activity-scoring.js's free-text fallback. */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['unjumble'] = {
  renderQuestion(container, question, activity, onAnswer) {
    const sentence = String(question.text || '').trim();
    const words = sentence.split(/\s+/);
    const scrambled = shuffleArray(words.map((w, i) => ({ w, key: i + '-' + w })));

    container.innerHTML = `
      <div class="tpl-unjumble">
        ${question.imageUrl ? `<img class="tpl-question-image" src="${question.imageUrl}" alt="">` : ''}
        <div class="tpl-unjumble-built" id="tplUnjBuilt"></div>
        <div class="tpl-unjumble-bank" id="tplUnjBank"></div>
        <button class="tpl-clear-btn" id="tplUnjClear">Clear</button>
      </div>`;

    const builtEl = container.querySelector('#tplUnjBuilt');
    const bankEl = container.querySelector('#tplUnjBank');
    let built = [];

    function renderAll() {
      builtEl.innerHTML = '';
      built.forEach((item, i) => {
        const t = document.createElement('button');
        t.className = 'tpl-unjumble-word is-placed';
        t.textContent = item.w;
        t.onclick = () => { built.splice(i, 1); renderAll(); };
        builtEl.appendChild(t);
      });

      bankEl.innerHTML = '';
      const remaining = scrambled.filter(s => !built.some(b => b.key === s.key));
      remaining.forEach(item => {
        const t = document.createElement('button');
        t.className = 'tpl-unjumble-word';
        t.textContent = item.w;
        t.onclick = () => { built.push(item); renderAll(); };
        bankEl.appendChild(t);
      });

      if (built.length === words.length) {
        setTimeout(() => onAnswer(built.map(b => b.w).join(' ')), 400);
      }
    }

    container.querySelector('#tplUnjClear').onclick = () => { built = []; renderAll(); };
    renderAll();
  }
};
