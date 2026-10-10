/* Template: Random Wheel — a spin flourish, then the question is answered
   like a quiz. (Question order/randomisation is handled once by
   activity-state.js via activity.config.shuffleQuestions, same as every
   other template — the wheel is the reveal animation for "what's next".) */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['random-wheel'] = {
  renderQuestion(container, question, activity, onAnswer) {
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];
    const segments = colors.map((c, i) =>
      `<div class="tpl-wheel-segment" style="--seg-color:${c}; --seg-index:${i}; --seg-total:${colors.length};"></div>`
    ).join('');

    container.innerHTML = `
      <div class="tpl-wheel-wrap">
        <div class="tpl-wheel" id="tplWheel">${segments}<div class="tpl-wheel-pointer"></div></div>
        <button class="btn-primary" id="tplSpinBtn">Spin the Wheel</button>
        <div id="tplWheelReveal" style="display:none;"></div>
      </div>`;

    const wheel = container.querySelector('#tplWheel');
    const spinBtn = container.querySelector('#tplSpinBtn');
    const reveal = container.querySelector('#tplWheelReveal');

    spinBtn.onclick = () => {
      spinBtn.disabled = true;
      const turns = 4 + Math.random() * 2;
      wheel.style.transform = `rotate(${turns * 360}deg)`;
      setTimeout(() => {
        spinBtn.style.display = 'none';
        reveal.style.display = 'block';
        window.ActivityTemplates['quiz'].renderQuestion(reveal, question, activity, onAnswer);
      }, 1400);
    };
  }
};
