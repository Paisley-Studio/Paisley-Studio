/* Template: Flashcards — flip card self-assessment.
   Question.text is the front, question.explanation is the back.
   Scoring convention: the builder sets correctOptionIds:['known'] on every
   flashcard question, so clicking "I knew it" scores as correct and
   "Review again" scores as incorrect — letting flashcards reuse the same
   generic scoring/results pipeline as every other template. */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['flashcards'] = {
  renderQuestion(container, question, activity, onAnswer) {
    container.innerHTML = `
      <div class="tpl-flashcard-wrap">
        <div class="tpl-flashcard" id="tplCard">
          <div class="tpl-flashcard-face tpl-flashcard-front">
            ${question.imageUrl ? `<img class="tpl-question-image" src="${question.imageUrl}" alt="">` : ''}
            <div>${escapeActivityHtml(question.text)}</div>
          </div>
          <div class="tpl-flashcard-face tpl-flashcard-back" style="display:none;">
            <div>${escapeActivityHtml(question.explanation || '')}</div>
          </div>
        </div>
        <button class="tpl-flip-btn" id="tplFlipBtn">Flip card</button>
        <div class="tpl-flashcard-actions" id="tplFcActions" style="display:none;">
          <button class="tpl-option-btn is-incorrect-outline" id="tplFcReview">Review again</button>
          <button class="tpl-option-btn is-correct-outline" id="tplFcKnown">I knew it</button>
        </div>
      </div>`;

    const front = container.querySelector('.tpl-flashcard-front');
    const back = container.querySelector('.tpl-flashcard-back');
    const flipBtn = container.querySelector('#tplFlipBtn');
    const actions = container.querySelector('#tplFcActions');

    flipBtn.onclick = () => {
      const showingFront = front.style.display !== 'none';
      front.style.display = showingFront ? 'none' : 'flex';
      back.style.display = showingFront ? 'flex' : 'none';
      flipBtn.textContent = showingFront ? 'Flip back' : 'Flip card';
      actions.style.display = showingFront ? 'flex' : 'none';
    };

    container.querySelector('#tplFcReview').onclick = () => onAnswer('review');
    container.querySelector('#tplFcKnown').onclick = () => onAnswer('known');
  }
};
