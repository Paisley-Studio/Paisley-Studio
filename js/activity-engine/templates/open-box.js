/* Template: Open the Box — a grid of unopened boxes; picking any of them
   reveals the next question (order/shuffle already handled by
   activity-state.js), then answered like a quiz. */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['open-box'] = {
  renderQuestion(container, question, activity, onAnswer) {
    const boxCount = 6;
    const boxes = Array.from({ length: boxCount }, (_, i) => i);

    container.innerHTML = `
      <div class="tpl-openbox">
        <p class="tpl-matchup-hint">Pick a box to reveal the next question.</p>
        <div class="tpl-openbox-grid" id="tplBoxGrid">
          ${boxes.map(i => `<button class="tpl-openbox-box" data-i="${i}">📦</button>`).join('')}
        </div>
        <div id="tplBoxReveal" style="display:none;"></div>
      </div>`;

    const grid = container.querySelector('#tplBoxGrid');
    const reveal = container.querySelector('#tplBoxReveal');

    [...grid.children].forEach(btn => {
      btn.onclick = () => {
        [...grid.children].forEach(b => b.disabled = true);
        btn.textContent = '✨';
        btn.classList.add('is-opened');
        setTimeout(() => {
          grid.style.display = 'none';
          reveal.style.display = 'block';
          window.ActivityTemplates['quiz'].renderQuestion(reveal, question, activity, onAnswer);
        }, 500);
      };
    });
  }
};
