/* Template: Group Sort — tap an item, then tap the bucket it belongs in.
   Scored against question.groupId (see activity-scoring.js). */
window.ActivityTemplates = window.ActivityTemplates || {};
window.ActivityTemplates['group-sort'] = {
  mode: 'board',
  renderBoard(container, questions, activity, onAllAnswered) {
    const groups = activity.groups && activity.groups.length
      ? activity.groups
      : [{ id: 'group-a', name: 'Group A' }, { id: 'group-b', name: 'Group B' }];

    container.innerHTML = `
      <div class="tpl-groupsort">
        <p class="tpl-matchup-hint">Tap an item, then tap the group it belongs in.</p>
        <div class="tpl-groupsort-items" id="tplGsItems"></div>
        <div class="tpl-groupsort-buckets" id="tplGsBuckets"></div>
      </div>`;

    const itemsWrap = container.querySelector('#tplGsItems');
    const bucketsWrap = container.querySelector('#tplGsBuckets');
    const answers = {};
    let selected = null;
    let placedCount = 0;

    const items = shuffleArray(questions);
    items.forEach(q => {
      const el = document.createElement('button');
      el.className = 'tpl-groupsort-item';
      el.textContent = q.text;
      el.dataset.qid = q.id;
      el.onclick = () => {
        if (el.classList.contains('is-placed')) return;
        [...itemsWrap.children].forEach(c => c.classList.remove('is-selected'));
        el.classList.add('is-selected');
        selected = q.id;
      };
      itemsWrap.appendChild(el);
    });

    groups.forEach(g => {
      const bucket = document.createElement('div');
      bucket.className = 'tpl-groupsort-bucket';
      bucket.innerHTML = `<div class="tpl-groupsort-bucket-title">${escapeActivityHtml(g.name)}</div><div class="tpl-groupsort-bucket-list"></div>`;
      bucket.onclick = () => {
        if (!selected) return;
        const itemEl = itemsWrap.querySelector(`[data-qid="${CSS.escape(selected)}"]`);
        answers[selected] = g.id;
        itemEl.classList.remove('is-selected');
        itemEl.classList.add('is-placed');
        bucket.querySelector('.tpl-groupsort-bucket-list').appendChild(
          Object.assign(document.createElement('div'), { className: 'tpl-groupsort-placed', textContent: itemEl.textContent })
        );
        selected = null;
        placedCount++;
        if (placedCount === questions.length) {
          setTimeout(() => onAllAnswered(answers), 400);
        }
      };
      bucketsWrap.appendChild(bucket);
    });
  }
};
