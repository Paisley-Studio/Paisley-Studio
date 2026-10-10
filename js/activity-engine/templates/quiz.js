/* =========================================================
   Template: Quiz — standard multiple choice
   -----------------------------------------------------------
   Sound + animation hooks rely on:
     • ActivitySounds.correct() / .wrong()   (engine file)
     • .is-correct / .is-incorrect classes   (activity-engine.css)
     • .activity-score.bump on the chrome    (activity-engine.js)
   The template itself only toggles classes and plays a tone;
   the engine handles scoring and progression.
========================================================= */
window.ActivityTemplates = window.ActivityTemplates || {};

window.ActivityTemplates['quiz'] = {
  renderQuestion(container, question, activity, onAnswer) {
    const options = activity.config && activity.config.shuffleAnswers
      ? shuffleArray(question.options || [])
      : (question.options || []);

    container.innerHTML = `
      <div class="tpl-quiz">
        ${question.imageUrl ? `<img class="tpl-question-image" src="${escapeActivityHtml(question.imageUrl)}" alt="">` : ''}
        <div class="tpl-question-text">${escapeActivityHtml(question.text)}</div>
        <div class="tpl-options" id="tplOptions"></div>
      </div>`;

    const optWrap = container.querySelector('#tplOptions');
    let answered = false;

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tpl-option-btn';
      btn.textContent = opt.text;

      btn.onclick = () => {
        if (answered) return;
        answered = true;

        const correctIds = question.correctOptionIds || [];
        const isCorrect = correctIds.includes(opt.id);

        // Mark the picked button
        btn.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');

        // If they got it wrong, reveal the correct answer
        if (!isCorrect) {
          const correctBtn = [...optWrap.children].find((b, i) =>
            correctIds.includes(options[i].id)
          );
          if (correctBtn) correctBtn.classList.add('is-correct');
        }

        // Sound — one tone per outcome
        if (isCorrect) {
          try { ActivitySounds.correct(); } catch (e) {}
        } else {
          try { ActivitySounds.wrong(); } catch (e) {}
        }

        // Lock the whole option set
        [...optWrap.children].forEach(b => { b.disabled = true; });

        // Give the visual a moment to land before advancing
        setTimeout(() => onAnswer(opt.id), 700);
      };

      optWrap.appendChild(btn);
    });
  }
};