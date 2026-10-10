/* Template: True/False — a quiz with exactly two fixed options */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['true-false'] = {
  renderQuestion(container, question, activity, onAnswer) {
    container.innerHTML = `
      <div class="tpl-quiz tpl-truefalse">
        ${question.imageUrl ? `<img class="tpl-question-image" src="${question.imageUrl}" alt="">` : ''}
        <div class="tpl-question-text">${escapeActivityHtml(question.text)}</div>
        <div class="tpl-options tpl-truefalse-options" id="tplOptions">
          <button class="tpl-option-btn tpl-tf-true" data-v="true">True</button>
          <button class="tpl-option-btn tpl-tf-false" data-v="false">False</button>
        </div>
      </div>`;

    const optWrap = container.querySelector('#tplOptions');
    let answered = false;
    // correctOptionIds should contain exactly one of 'true'/'false'
    const correctValue = (question.correctOptionIds || [])[0];

    [...optWrap.children].forEach(btn => {
      btn.onclick = () => {
        if (answered) return;
        answered = true;
        const v = btn.dataset.v;
        const correct = v === correctValue;
        btn.classList.add(correct ? 'is-correct' : 'is-incorrect');
        if (!correct) {
          const rightBtn = [...optWrap.children].find(b => b.dataset.v === correctValue);
          if (rightBtn) rightBtn.classList.add('is-correct');
        }
        [...optWrap.children].forEach(b => b.disabled = true);
        setTimeout(() => onAnswer(v), 550);
      };
    });
  }
};
