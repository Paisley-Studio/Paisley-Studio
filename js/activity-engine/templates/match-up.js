/* =========================================================
   Template: Match Up
   -----------------------------------------------------------
   Left column = each question's prompt.
   Right column = shuffled list of every question's paired option
                  (each question has exactly one entry in `options`,
                  and correctOptionIds holds that one id).

   Behaviour:
     • Tap a left item — it lifts and pulses to show it's selected.
     • Tap a right item — the pair snaps together. If correct, both
       go green with a ✓ badge and a chime. If wrong, both flash
       red briefly, then still lock in place so the student can move
       on (matches the "did I know it" feel of Wordwall).
     • A per-match sound plays. When all pairs are locked, the engine
       is notified and it moves to the results screen (with confetti
       if they passed).
   ========================================================= */
window.ActivityTemplates = window.ActivityTemplates || {};

window.ActivityTemplates['match-up'] = {
  mode: 'board',

  renderBoard(container, questions, activity, onAllAnswered) {
    // Build the right column as {id, text} pairs, one per question.
    const rightItems = shuffleArray(
      questions.map(q => ({
        id:    (q.options && q.options[0] && q.options[0].id) || q.id,
        text:  (q.options && q.options[0] && q.options[0].text) || '',
        forQuestionId: q.id
      }))
    );

    container.innerHTML = `
      <div class="tpl-matchup">
        <p class="tpl-matchup-hint">Tap an item on the left, then tap its match on the right.</p>
        <div class="tpl-matchup-columns">
          <div class="tpl-matchup-col" id="tplLeftCol"></div>
          <div class="tpl-matchup-col" id="tplRightCol"></div>
        </div>
      </div>`;

    const leftCol  = container.querySelector('#tplLeftCol');
    const rightCol = container.querySelector('#tplRightCol');

    const answers = {};
    let selectedLeft = null;
    let matchedCount = 0;

    /* ---------------- left column ---------------- */
    questions.forEach(q => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tpl-matchup-item';
      el.textContent = q.text;
      el.dataset.qid = q.id;

      el.onclick = () => {
        if (el.classList.contains('is-matched')) return;
        // Tapping the same item again deselects it
        if (selectedLeft === q.id) {
          el.classList.remove('is-selected');
          selectedLeft = null;
          return;
        }
        // Only one left item can be selected at a time
        [...leftCol.children].forEach(c => c.classList.remove('is-selected'));
        el.classList.add('is-selected');
        selectedLeft = q.id;
      };

      leftCol.appendChild(el);
    });

    /* ---------------- right column ---------------- */
    rightItems.forEach(r => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tpl-matchup-item';
      el.textContent = r.text;
      el.dataset.rid = r.id;

      el.onclick = () => {
        if (el.classList.contains('is-matched')) return;
        if (!selectedLeft) return;

        const leftEl = leftCol.querySelector(`[data-qid="${CSS.escape(selectedLeft)}"]`);
        if (!leftEl) return;

        // Work out whether the picked right item is the correct pair
        const questionId = selectedLeft;
        const question   = questions.find(q => q.id === questionId);
        const expectedId = (question && question.correctOptionIds && question.correctOptionIds[0]) || null;
        const isCorrect  = expectedId === r.id;

        // Record the answer regardless — the engine scores it later.
        answers[questionId] = r.id;

        // Lock both items in place
        leftEl.classList.remove('is-selected');
        leftEl.classList.add('is-matched');
        el.classList.add('is-matched');

        if (isCorrect) {
          try { ActivitySounds.correct(); } catch (e) {}
        } else {
          // Wrong — flash red, then settle back to the matched style.
          leftEl.classList.add('is-wrong-flash');
          el.classList.add('is-wrong-flash');
          try { ActivitySounds.wrong(); } catch (e) {}
          setTimeout(() => {
            leftEl.classList.remove('is-wrong-flash');
            el.classList.remove('is-wrong-flash');
          }, 600);
        }

        selectedLeft = null;
        matchedCount++;

        if (matchedCount === questions.length) {
          // Small delay so the last snap animation finishes before
          // we swap the whole screen out for the results view.
          setTimeout(() => onAllAnswered(answers), 700);
        }
      };

      rightCol.appendChild(el);
    });
  }
};