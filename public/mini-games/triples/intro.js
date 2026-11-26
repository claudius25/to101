'use strict';

{
  const intro = document.querySelector('.intro');
  const board = intro.querySelector('.intro-board');
  const source = intro.querySelector('#intro-source');
  const target = intro.querySelector('#intro-target');
  const blackTile = intro.querySelector('#intro-black');
  const yellow = intro.querySelector('#intro-yellow');
  const blue = intro.querySelector('#intro-blue');
  const gesture = intro.querySelector('.intro-gesture');
  const lessonPanel = intro.querySelector('.intro-lesson');
  const skipButton = intro.querySelector('#intro-skip');
  const skipIntroKey = 'triples.skipIntro';
  const skipIntroThreshold = 5;
  const title = intro.querySelector('#intro-title');
  const heart = TRIPLES_SETTINGS.families.find(({ id }) => id === 'group-1');
  const partners = board.querySelectorAll('.intro-partner');
  showTileFace(source.firstElementChild, tiles[heart.id]);
  showTileFace(partners[0].firstElementChild, tiles[heart.id], heart.art);
  showTileFace(partners[1].firstElementChild, tiles[heart.id]);
  showTileFace(board.querySelector('#intro-yellow .tile-face'), { color: TILE_COLORS.kidney });
  showTileFace(board.querySelector('#intro-blue .tile-face'), { color: TILE_COLORS.stomach });
  target.disabled = true;

  let drag = null;
  let ignoreClick = false;
  let lesson = 1;
  let completed = false;
  let cornerTaps = 0;
  let firstCornerTap = 0;

  document.addEventListener('pointerup', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.clientX < 0 || event.clientX > 44 || event.clientY < 0 || event.clientY > 44) {
      cornerTaps = 0;
      return;
    }
    if (cornerTaps === 0 || event.timeStamp - firstCornerTap > 1200) {
      firstCornerTap = event.timeStamp;
      cornerTaps = 0;
    }
    if (++cornerTaps !== 3) return;
    cornerTaps = 0;

    if (window.parent !== window) {
      window.parent.postMessage('triples:reset-storage', '*');
      return;
    }
    try {
      localStorage.removeItem(skipIntroKey);
      sessionStorage.removeItem(triplesRunKey);
      const url = new URL(window.location.href);
      url.searchParams.delete('skipIntro');
      window.location.replace(url.href);
    } catch {
      // Storage may be disabled for this page.
    }
  });
  function placePracticeTiles({ yellowAt = 4, blueAt = 7, heartAt, partnerAt, targetAt = 13, blackAt }) {
    const positions = { [yellowAt]: yellow, [blueAt]: blue, [targetAt]: target, 12: source };
    const place = (index, tile, label) => {
      positions[index] = tile;
      tile.setAttribute('aria-label', `${label}, row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}`);
    };
    place(yellowAt, yellow, 'Yellow tile');
    place(blueAt, blue, 'Blue tile');
    if (heartAt !== undefined) place(heartAt, partners[0], 'Heart');
    place(partnerAt, partners[1], lesson === 4 ? 'Gray tile' : 'Matching tile');
    if (blackAt !== undefined) place(blackAt, blackTile, 'Black tile');
    const squares = Array.from({ length: 16 }, (_, index) => {
      if (positions[index]) return positions[index];
      const empty = document.createElement('span');
      empty.className = 'cell empty';
      empty.setAttribute('aria-hidden', 'true');
      return empty;
    });
    board.replaceChildren(...squares, gesture);
  }

  placePracticeTiles({ heartAt: 5, partnerAt: 9 });

  function selectTile(selected) {
    source.setAttribute('aria-pressed', String(selected));
    target.disabled = !selected;
  }

  async function completeMatch(clickEvent) {
    board.classList.add('matched');
    for (const tile of partners) {
      tile.setAttribute('aria-hidden', 'true');
    }
    source.disabled = true;
    source.setAttribute('aria-hidden', 'true');
    target.disabled = true;
    target.classList.remove('empty');
    if (lesson === 4) {
      showTileFace(target.firstElementChild, tiles.black);
      target.setAttribute('aria-label', 'Black tile');
    } else {
      target.classList.add('fixed');
      showTileFace(target.firstElementChild, tiles.fixed);
      target.setAttribute('aria-label', 'Matched gray tile');
    }
    if (lesson !== 4 && !reducedMotion.matches) {
      const tile = tiles[heart.id];
      const followers = [...partners].map((partner, index) => ({
        face: makeSlidingFace(tile, index === 0 ? heart.art : null),
        source: partner,
      }));
      await animateMerge(board, makeSlidingFace(tile), clickEvent ? source : target, target,
        clickEvent ? slideDurationMs : 0, followers, 4);
      if (intro.hidden) return;
    }
    if (lesson === 5) {
      if (!reducedMotion.matches) {
        const distance = blackTile.offsetLeft - target.offsetLeft;
        await target.firstElementChild.animate(
          [
            { transform: 'translateX(0) scale(1)', opacity: 1 },
            { transform: `translateX(${distance}px) scale(0.2)`, opacity: 0 },
          ],
          { delay: 320, duration: 300, easing: 'ease-in' },
        ).finished;
      }
      target.classList.replace('fixed', 'empty');
      showTileFace(target.firstElementChild);
      target.setAttribute('aria-label', 'Cleared space');
      if (intro.hidden) return;
    }
    if (lesson === 5) {
      completed = true;
      skipButton.textContent = 'PLAY';
      skipButton.focus();
    } else {
      await advanceLesson();
    }
  }

  function showCornerLesson() {
    lesson = 2;
    placePracticeTiles({ heartAt: 10, partnerAt: 9 });
    resetLesson('Make an L-shaped match');
  }

  function showRouteLesson() {
    lesson = 3;
    placePracticeTiles({ yellowAt: 9, blueAt: 13, heartAt: 7, partnerAt: 11, targetAt: 3 });
    board.classList.add('route-lesson');
    resetLesson('Slide around a corner');
  }

  function showAbsorptionLesson() {
    lesson = 4;
    placePracticeTiles({ partnerAt: 9 });
    board.classList.remove('route-lesson');
    board.classList.add('absorption-lesson');
    showTileFace(partners[1].firstElementChild, tiles.fixed);
    partners[1].classList.add('intro-gray');
    showTileFace(source.firstElementChild, tiles.black);
    source.setAttribute('aria-label', 'Select black tile');
    resetLesson('Absorb a gray tile');
  }

  function showChainLesson() {
    lesson = 5;
    board.classList.remove('absorption-lesson');
    placePracticeTiles({ heartAt: 10, partnerAt: 9, blackAt: 14 });
    partners[1].classList.remove('intro-gray');
    showTileFace(partners[1].firstElementChild, tiles[heart.id]);
    showTileFace(source.firstElementChild, tiles[heart.id]);
    source.setAttribute('aria-label', 'Select bottom-left tile');
    showTileFace(blackTile.firstElementChild, tiles.black);
    resetLesson('Match and absorb');
  }

  function resetLesson(heading) {
    for (const tile of partners) tile.removeAttribute('aria-hidden');
    board.classList.remove('matched');
    source.disabled = false;
    source.removeAttribute('aria-hidden');
    source.style.removeProperty('--intro-slide');
    source.style.removeProperty('--intro-rise');
    selectTile(false);
    ignoreClick = false;
    target.classList.remove('fixed');
    target.classList.add('empty');
    showTileFace(target.firstElementChild);
    target.setAttribute('aria-label', 'Move selected tile here');
    title.textContent = heading;
  }

  source.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreClick = false;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: target.offsetLeft - source.offsetLeft,
      rise: source.offsetTop - target.offsetTop,
      cornerReached: false,
    };
    source.setPointerCapture(event.pointerId);
  });

  source.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) >= TRIPLES_SETTINGS.rules.dragThreshold) {
      ignoreClick = true;
      board.classList.add('practicing');
    }
    const tolerance = source.offsetWidth / 2;
    if (lesson === 3 && Math.abs(dx) <= tolerance && dy <= -drag.rise + tolerance) {
      drag.cornerReached = true;
    }
    const slide = lesson !== 3 || drag.cornerReached ? Math.min(drag.distance, Math.max(0, dx)) : 0;
    const rise = drag.cornerReached ? -drag.rise : Math.max(-drag.rise, Math.min(0, dy));
    source.style.setProperty('--intro-slide', `${slide}px`);
    source.style.setProperty('--intro-rise', `${rise}px`);
  });

  function finishDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const { x, distance, rise, cornerReached } = drag;
    drag = null;
    board.classList.remove('practicing');
    const rect = target.getBoundingClientRect();
    const padding = Math.min(TRIPLES_SETTINGS.rules.touchReleasePadding, rect.width / 4);
    if (
      event.type === 'pointerup' &&
      (lesson !== 3 || cornerReached) &&
      event.clientX - x >= distance / 2 &&
      event.clientX >= rect.left - padding && event.clientX <= rect.right + padding &&
      event.clientY >= rect.top - padding && event.clientY <= rect.bottom + padding
    ) {
      source.style.setProperty('--intro-slide', `${distance}px`);
      source.style.setProperty('--intro-rise', `${-rise}px`);
      completeMatch();
    } else {
      source.style.removeProperty('--intro-slide');
      source.style.removeProperty('--intro-rise');
    }
  }

  source.addEventListener('pointerup', finishDrag);
  source.addEventListener('pointercancel', finishDrag);
  source.addEventListener('lostpointercapture', finishDrag);
  source.addEventListener('click', (event) => {
    if (!ignoreClick || event.detail === 0) {
      const selected = source.getAttribute('aria-pressed') !== 'true';
      selectTile(selected);
      if (selected && event.detail === 0) target.focus();
    }
  });
  target.addEventListener('click', completeMatch);
  function openGame(focusPlay = true) {
    intro.hidden = true;
    document.querySelector('main').hidden = false;
    if (focusPlay) {
      saveTriplesRun();
      document.querySelector('#settings-open').focus();
    }
  }
  async function advanceLesson() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (intro.hidden) return;

    const distance = intro.clientWidth + 24;
    if (!reducedMotion.matches) {
      const exit = lessonPanel.animate(
        [{ translate: '0' }, { translate: `${-distance}px` }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' },
      );
      await exit.finished;
      exit.cancel();
      if (intro.hidden) return;
    }

    if (lesson === 1) showCornerLesson();
    else if (lesson === 2) showRouteLesson();
    else if (lesson === 3) showAbsorptionLesson();
    else showChainLesson();

    if (!reducedMotion.matches) {
      lessonPanel.inert = true;
      await lessonPanel.animate(
        [{ translate: `${distance}px` }, { translate: '0' }],
        { duration: 260, easing: 'ease-out' },
      ).finished;
      lessonPanel.inert = false;
    }
    if (!intro.hidden) title.focus({ preventScroll: true });
  }

  skipButton.addEventListener('click', () => {
    if (completed) {
      openGame();
      return;
    }
    if (window.parent !== window) {
      window.parent.postMessage('triples:skip-intro', '*');
    } else {
      try {
        const count = Number(localStorage.getItem(skipIntroKey)) || 0;
        localStorage.setItem(skipIntroKey, String(Math.min(count + 1, skipIntroThreshold)));
      } catch {
        // The game still opens when browser storage is unavailable.
      }
    }
    openGame();
  });

  let skipIntro = new URLSearchParams(window.location.search).get('skipIntro') === '1';
  if (window.parent === window && !skipIntro) {
    try {
      skipIntro = Number(localStorage.getItem(skipIntroKey)) >= skipIntroThreshold;
    } catch {
      // Show the intro when browser storage is unavailable.
    }
  }
  if (skipIntro) openGame(false);

  const navigation = performance.getEntriesByType('navigation')[0];
  function initializeRun(snapshot, appRefreshed = false) {
    const freshBoard = appRefreshed || navigation?.type === 'reload';
    if (restoreTriplesRun(snapshot, freshBoard)) {
      openGame(false);
      if (freshBoard) saveTriplesRun();
    } else if (skipIntro) {
      saveTriplesRun();
    }
  }

  if (window.parent !== window) {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || event.data?.type !== 'triples:restore-run') return;
      initializeRun(event.data.snapshot, event.data.freshBoard === true);
    });
  } else {
    try {
      initializeRun(sessionStorage.getItem(triplesRunKey));
    } catch {
      // Storage may be disabled for this page.
    }
  }
}
