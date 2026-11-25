'use strict';

{
  const intro = document.querySelector('.intro');
  const board = intro.querySelector('.intro-board');
  const source = intro.querySelector('#intro-source');
  const target = intro.querySelector('#intro-target');
  const bottomRight = intro.querySelector('#intro-bottom-right');
  const continueButton = intro.querySelector('#intro-continue');
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
  let cornerLayout;

  function selectTile(selected) {
    source.setAttribute('aria-pressed', String(selected));
    target.disabled = !selected;
  }

  async function completeMatch() {
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
    if (lesson === 5) {
      if (!reducedMotion.matches) {
        const distance = bottomRight.offsetLeft - target.offsetLeft;
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
    continueButton.textContent = lesson === 5 ? 'Continue to game' : 'Next lesson';
    continueButton.hidden = false;
    continueButton.focus();
  }

  function showCornerLesson() {
    lesson = 2;
    const middleRight = board.querySelector('#intro-middle-right');
    middleRight.before(partners[0]);
    board.querySelector('#intro-yellow').after(middleRight);
    partners[0].setAttribute('aria-label', 'Heart, row 2, column 3');
    resetLesson('Make an L-shaped match');
  }

  function showRouteLesson() {
    lesson = 3;
    cornerLayout = [...board.children];
    const [yellow, topLeft, blue, middleLeft, , , , , , gesture] = cornerLayout;
    board.append(topLeft, middleLeft, target, bottomRight, yellow,
      partners[0], source, blue, partners[1], gesture);
    yellow.setAttribute('aria-label', 'Yellow tile, row 2, column 2');
    blue.setAttribute('aria-label', 'Blue tile, row 3, column 2');
    partners[1].setAttribute('aria-label', 'Matching tile, row 3, column 3');
    board.classList.add('route-lesson');
    resetLesson('Slide around a corner');
  }

  function showAbsorptionLesson() {
    lesson = 4;
    board.append(...cornerLayout);
    board.classList.remove('route-lesson');
    board.querySelector('#intro-yellow').setAttribute('aria-label', 'Yellow tile, row 1, column 1');
    board.querySelector('#intro-blue').setAttribute('aria-label', 'Blue tile, row 1, column 3');
    board.classList.add('absorption-lesson');
    partners[0].classList.add('empty');
    showTileFace(partners[1].firstElementChild, tiles.fixed);
    partners[1].classList.add('intro-gray');
    partners[1].setAttribute('aria-label', 'Gray tile, row 2, column 2');
    showTileFace(source.firstElementChild, tiles.black);
    source.setAttribute('aria-label', 'Select black tile');
    resetLesson('Absorb a gray tile');
    partners[0].setAttribute('aria-hidden', 'true');
  }

  function showChainLesson() {
    lesson = 5;
    board.classList.remove('absorption-lesson');
    partners[0].classList.remove('empty');
    partners[1].classList.remove('intro-gray');
    partners[1].setAttribute('aria-label', 'Matching tile, row 2, column 2');
    showTileFace(partners[1].firstElementChild, tiles[heart.id]);
    showTileFace(source.firstElementChild, tiles[heart.id]);
    source.setAttribute('aria-label', 'Select bottom-left tile');
    bottomRight.classList.remove('empty');
    bottomRight.removeAttribute('aria-hidden');
    bottomRight.setAttribute('aria-label', 'Black tile, row 3, column 3');
    showTileFace(bottomRight.firstElementChild, tiles.black);
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
    continueButton.hidden = true;
    title.textContent = heading;
    title.focus();
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
      selectTile(source.getAttribute('aria-pressed') !== 'true');
    }
  });
  target.addEventListener('click', completeMatch);
  function openGame(focusPlay = true) {
    intro.hidden = true;
    document.querySelector('main').hidden = false;
    if (focusPlay) document.querySelector('#shuffle').focus();
  }
  continueButton.addEventListener('click', () => {
    if (lesson === 1) showCornerLesson();
    else if (lesson === 2) showRouteLesson();
    else if (lesson === 3) showAbsorptionLesson();
    else if (lesson === 4) showChainLesson();
    else openGame();
  });
  skipButton.addEventListener('click', () => {
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
}
