/* Template: Matching Pairs — memory-style flip-and-match grid.
   Convention: same as Match Up — each question has one option[] entry,
   its pair. Every completed match is by definition correct, so this
   template scores 100% on completion; time/attempts are the challenge. */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['matching-pairs'] = {
  mode: 'board',
  renderBoard(container, questions, activity, onAllAnswered) {
    let cards = [];
    questions.forEach(q => {
      cards.push({ qid: q.id, text: q.text, kind: 'prompt' });
      cards.push({ qid: q.id, text: (q.options && q.options[0] && q.options[0].text) || '', kind: 'answer' });
    });
    cards = shuffleArray(cards);

    container.innerHTML = `
      <div class="tpl-pairs-grid" id="tplPairsGrid"></div>`;
    const grid = container.querySelector('#tplPairsGrid');
    const answers = {};
    let flipped = [];
    let lock = false;
    let matchedCount = 0;

    cards.forEach((card, i) => {
      const btn = document.createElement('button');
      btn.className = 'tpl-pair-card';
      btn.dataset.i = i;
      btn.textContent = '?';
      btn.onclick = () => {
        if (lock || btn.classList.contains('is-matched') || btn.classList.contains('is-flipped')) return;
        btn.classList.add('is-flipped');
        btn.textContent = card.text;
        flipped.push({ btn, card });
        if (flipped.length === 2) {
          lock = true;
          const [a, b] = flipped;
          const isMatch = a.card.qid === b.card.qid && a.card.kind !== b.card.kind;
          setTimeout(() => {
            if (isMatch) {
              a.btn.classList.add('is-matched');
              b.btn.classList.add('is-matched');
              answers[a.card.qid] = questions.find(q => q.id === a.card.qid).options[0].id;
              matchedCount++;
              if (matchedCount === questions.length) {
                setTimeout(() => onAllAnswered(answers), 300);
              }
            } else {
              a.btn.classList.remove('is-flipped');
              b.btn.classList.remove('is-flipped');
              a.btn.textContent = '?';
              b.btn.textContent = '?';
            }
            flipped = [];
            lock = false;
          }, 700);
        }
      };
      grid.appendChild(btn);
    });
  }
};
