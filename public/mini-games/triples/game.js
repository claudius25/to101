'use strict';

const { rules, copy, art, families } = TRIPLES_SETTINGS;
const { size, moveLimit } = rules;
const groupSize = 3;
const groupCount = Math.min(
  families.length,
  Math.floor((size * size - 1 - rules.minimumEmptyTiles) / groupSize),
);
if (
  !Number.isInteger(size) ||
  groupCount < 1 ||
  !Number.isInteger(moveLimit) ||
  moveLimit < 1 ||
  !Number.isInteger(rules.minimumEmptyTiles) ||
  rules.minimumEmptyTiles < 1 ||
  !Number.isInteger(rules.shuffleSamples) ||
  rules.shuffleSamples < 1
) {
  throw new Error(
    'Check the board size, family count, empty spaces, move limit, and shuffle samples in settings.js.',
  );
}
const emptyCount = size * size - groupCount * groupSize - 1;
const examples = families.map(({ organ, condition, care, source, note }) => [
  organ,
  condition,
  care,
  source,
  note,
]);
const labelTypes = copy.roles;

function format(text, values) {
  return text.replace(/\{(\w+)\}/g, (token, key) => values[key] ?? token);
}

function plainLabel(text) {
  return text.replaceAll('-\n', '').replaceAll('\n', ' ');
}

document.title = copy.title;
document.querySelector('#game-title').textContent = copy.title;
document.querySelector('#instructions').textContent = [
  copy.instructions,
  rules.blackClearsGray ? format(copy.blackRule, { cost: rules.blackGrayMoveCost }) : '',
  format(copy.goal, { groups: groupCount, limit: moveLimit }),
]
  .filter(Boolean)
  .join(' ');
document.querySelector('#moves-label').textContent = copy.moveLabel;
document.querySelector('#move-limit').textContent = String(moveLimit);
// document.querySelector('#reference-title').textContent = copy.reference;

const reference = document.querySelector('#reference');
for (const [organ, condition, care, url, note] of examples) {
  const item = document.createElement('li');
  item.textContent =
    [organ, condition, care].map(plainLabel).join(' → ') + '. ' + (note ? note + ' ' : '');
  // const link = document.createElement('a');
  // link.href = url;
  // link.textContent = copy.source;
  // item.append(link);
  // reference.append(item);
}

const tileLabels = new Map();
const colors = families.map((family) => family.id);
const familyTileColors = families.map((family) => family.tileColor);

function rgb(hex) {
  return hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16));
}

function linearRgb(channels) {
  return channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}

function luminance(channels) {
  const [red, green, blue] = linearRgb(channels);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// OKLab distances approximate how different two swatches look to the eye.
function toOklab(channels) {
  const [red, green, blue] = linearRgb(channels);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const theme = getComputedStyle(document.documentElement);
const darkLuminance = luminance(rgb(theme.getPropertyValue('--text-dark').trim()));
const lightLuminance = luminance(rgb(theme.getPropertyValue('--text-light').trim()));

function labelColor(channels) {
  const background = luminance(channels);
  const darkContrast = (background + 0.05) / (darkLuminance + 0.05);
  const lightContrast = (lightLuminance + 0.05) / (background + 0.05);
  if (Math.max(darkContrast, lightContrast) < 4.5) {
    return background > 0.179 ? '#000' : '#fff';
  }
  return darkContrast >= lightContrast ? 'var(--text-dark)' : 'var(--text-light)';
}

const tiles = Object.fromEntries(
  colors.map((id, index) => {
    const color = familyTileColors[index];
    const channels = rgb(color);
    return [
      id,
      {
        color,
        channels,
        lab: toOklab(channels),
        labelColor: labelColor(channels),
        symbol: String(index + 1),
      },
    ];
  }),
);
tiles.black = { color: art.black.color, kind: 'black' };
tiles.fixed = { color: art.fixed.color, kind: 'fixed' };

const board = document.querySelector('#board');
const boardResult = document.querySelector('#board-result');
board.style.setProperty('--size', size);
board.setAttribute('aria-label', format(copy.board, { size }));
const score = document.querySelector('#score');
const moveCount = document.querySelector('#move-count');
const status = document.querySelector('#status');
const shuffle = document.querySelector('#shuffle');
shuffle.textContent = copy.newBoard;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeEffects = new Set();
const slideDurationMs = 180;
const slideHoldMs = 100;
const slideSettleMs = 150;
const suctionPauseMs = 250;
let cells;
let selected;
let moves;
let merged;
let result;

function adjacent(first, second) {
  return (
    Math.abs(Math.floor(first / size) - Math.floor(second / size)) +
      Math.abs((first % size) - (second % size)) ===
    1
  );
}

function connectedTiles(layout, start) {
  const color = layout[start];
  if (color === null || color === 'black' || color === 'fixed') return [];
  const group = [start];
  for (let member = 0; member < group.length; member++) {
    layout.forEach((tile, index) => {
      if (tile === color && !group.includes(index) && adjacent(group[member], index)) {
        group.push(index);
      }
    });
  }
  return group;
}

function colorDistance(first, second) {
  const [lightness, a, b] = tiles[first].lab;
  const [otherLightness, otherA, otherB] = tiles[second].lab;
  return Math.hypot(lightness - otherLightness, a - otherA, b - otherB);
}

function chooseBoardColors() {
  const remaining = shuffleInPlace(colors.slice());
  const chosen = [remaining.pop()];
  while (chosen.length < groupCount) {
    let best = 0;
    let bestDistance = -1;
    remaining.forEach((candidate, index) => {
      const nearest = Math.min(...chosen.map((color) => colorDistance(candidate, color)));
      if (nearest > bestDistance) {
        best = index;
        bestDistance = nearest;
      }
    });
    chosen.push(remaining.splice(best, 1)[0]);
  }
  return chosen;
}

function colorClustering(layout) {
  let penalty = 0;
  layout.forEach((tile, index) => {
    if (!tiles[tile]?.lab) return;
    const column = index % size;
    const neighbors = [
      [index + size, 1],
      [column < size - 1 ? index + 1 : -1, 1],
      [column < size - 1 ? index + size + 1 : -1, rules.diagonalColorWeight],
      [column > 0 ? index + size - 1 : -1, rules.diagonalColorWeight],
    ];
    for (const [neighbor, weight] of neighbors) {
      const nearby = layout[neighbor];
      if (!tiles[nearby]?.lab) continue;
      const similarity = Math.max(0, rules.similarColorDistance - colorDistance(tile, nearby));
      penalty += weight * similarity ** 2;
    }
  });
  return penalty;
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function newBoard() {
  for (const finish of activeEffects) finish();
  const activeColors = chooseBoardColors();
  const deck = activeColors.flatMap((color) => Array(groupSize).fill(color));
  deck.push('black', ...Array(emptyCount).fill(null));
  let bestBoard;
  let bestPenalty = Infinity;
  for (let attempt = 0; attempt < rules.shuffleSamples; attempt++) {
    do {
      shuffleInPlace(deck);
    } while (deck.some((_, index) => connectedTiles(deck, index).length === groupSize));
    const penalty = colorClustering(deck);
    if (penalty < bestPenalty) {
      bestBoard = deck.slice();
      bestPenalty = penalty;
    }
  }
  board.querySelectorAll('.clearing-tile').forEach((tile) => tile.remove());
  cells = bestBoard;
  tileLabels.clear();
  colors.forEach((color, index) => {
    const positions = cells.flatMap((tile, position) => (tile === color ? [position] : []));
    // Shuffle the labels within each color so their roles are independent of position.
    shuffleInPlace(positions);
    positions.forEach((position, role) => {
      tileLabels.set(position, {
        text: examples[index][role],
        type: labelTypes[role],
        organ: role === 0 ? families[index].art : null,
      });
    });
  });
  selected = null;
  moves = 0;
  merged = 0;
  result = null;
  render();
  status.textContent = copy.ready;
}

function canSlideTo(source, target) {
  if (
    source === target ||
    cells[source] === null ||
    cells[source] === 'fixed' ||
    cells[target] !== null
  )
    return false;
  const sameRow = Math.floor(source / size) === Math.floor(target / size);
  if (!sameRow && source % size !== target % size) return false;
  const step = Math.sign(target - source) * (sameRow ? 1 : size);
  for (let index = source + step; index !== target; index += step) {
    if (cells[index] !== null) return false;
  }
  return true;
}

function canSlide(index) {
  return cells.some((_, target) => canSlideTo(index, target));
}

function slideDistance(source, target) {
  return (
    Math.abs(Math.floor(source / size) - Math.floor(target / size)) +
    Math.abs((source % size) - (target % size))
  );
}

function play(index) {
  if (result) return;
  let slide;
  const captured = [];
  if (cells[index] === 'fixed') {
    selected = null;
    status.textContent = copy.fixed;
  } else if (cells[index] !== null) {
    const movable = canSlide(index);
    selected = selected === index ? null : index;
    status.textContent =
      selected === null ? copy.deselected : movable ? copy.chooseEmpty : copy.blocked;
  } else if (selected !== null && canSlideTo(selected, index)) {
    const distance = rules.countDistance ? slideDistance(selected, index) : 1;
    if (moves + distance > moveLimit) {
      status.textContent = copy.overBudget;
      return;
    }
    for (const finish of activeEffects) finish();
    slide = prepareSlide(selected, index);
    moves += distance;
    if (tileLabels.has(selected)) {
      tileLabels.set(index, tileLabels.get(selected));
      tileLabels.delete(selected);
    }
    cells[index] = cells[selected];
    cells[selected] = null;
    selected = null;

    const group = connectedTiles(cells, index);
    const matched = group.length === groupSize;
    if (matched) {
      for (const target of group) {
        if (target === index) continue;
        animateClear(target);
        cells[target] = null;
        tileLabels.delete(target);
      }
      cells[index] = 'fixed';
      tileLabels.delete(index);
      merged++;
      status.textContent =
        merged === groupCount ? format(copy.win, { groups: groupCount }) : copy.merged;
    } else {
      status.textContent = copy.moved;
    }

    const grayCost = rules.blackGrayMoveCost;
    if (rules.blackClearsGray && cells[index] === 'black') {
      for (let target = 0; target < cells.length && moves + grayCost <= moveLimit; target++) {
        if (cells[target] !== 'fixed' || !adjacent(index, target)) continue;
        cells[target] = null;
        moves += grayCost;
        captured.push(target);
      }
      if (captured.length) {
        status.textContent = format(captured.length === 1 ? copy.grayMoved : copy.grayChain, {
          count: captured.length,
          cost: captured.length * grayCost,
        });
      }
    }

    if (merged === groupCount) {
      result = copy.winTitle;
    } else if (moves === moveLimit) {
      result = copy.lossTitle;
      status.textContent = format(copy.loss, { limit: moveLimit });
    } else if (!cells.some((_, target) => canSlide(target))) {
      result = copy.lossTitle;
      status.textContent = copy.stuck;
    }
  } else {
    status.textContent = copy.invalid;
  }
  render();
  if (slide) {
    animateSlide(slide);
    if (captured.length) animateSuction(index, captured);
  }
}

const buttons = Array.from({ length: size * size }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.index = index;
  const face = document.createElement('span');
  face.className = 'tile-face';
  button.append(face);
  button.addEventListener('click', () => play(index));
  board.append(button);
  return button;
});

function renderOrganLabel(element, organ) {
  const fontSize = Math.min(art.organMaxFont, art.leftHeight / organ.leftText.length);
  const step = fontSize * 0.84;
  const start = art.bottomY - step * organ.leftText.length;
  const left = [...organ.leftText]
    .map(
      (letter, index) =>
        `<text x="${art.leftX}" y="${start + index * step}" text-anchor="middle">${letter}</text>`,
    )
    .join('');
  const bottomLength = Math.min(art.bottomWidth, fontSize * organ.bottomText.length * 0.8);
  element.innerHTML = `<svg class="organ-label family-label" viewBox="0 0 256 256" aria-hidden="true">
    <g font-size="${fontSize}">
      ${left}
      <text x="14" y="${art.bottomY}" textLength="${bottomLength}" lengthAdjust="spacingAndGlyphs">${organ.bottomText}</text>
    </g>
  </svg>`;
}

function showTileText(element, tile, index) {
  const label = tileLabels.get(index);
  element.classList.toggle('text-tile', Boolean(label && !label.organ));
  element.classList.toggle('black-piece', tile?.kind === 'black');
  element.classList.toggle('fixed-piece', tile?.kind === 'fixed');
  element.style.setProperty('--tile', tile?.color ?? '');
  element.style.color = tile?.labelColor ?? '';
  if (label?.organ) {
    const image = document.createElement('img');
    image.className = 'organ-art';
    image.alt = '';
    image.src = '../../assets/triples/organs/' + label.organ.image;
    renderOrganLabel(element, label.organ);
    element.append(image);
  } else if (label) {
    element.textContent = '';
    const text = document.createElement('span');
    text.className =
      label.type === labelTypes[1] ? 'family-label condition-text' : 'family-label care-text';
    text.textContent = label.text;
    element.append(text);
  } else element.textContent = tile?.symbol ?? '';
}

function prepareSlide(source, target) {
  if (reducedMotion.matches) return null;
  const face = document.createElement('span');
  face.className = 'sliding-tile';
  face.setAttribute('aria-hidden', 'true');
  const tile = tiles[cells[source]];
  showTileText(face, tile, source);
  return { face, source, target };
}

function animateSlide({ face, source: sourceIndex, target }) {
  const source = buttons[sourceIndex];
  const destination = buttons[target].firstElementChild;
  face.style.left = `${source.offsetLeft}px`;
  face.style.top = `${source.offsetTop}px`;
  face.style.width = `${source.offsetWidth}px`;
  face.style.height = `${source.offsetHeight}px`;
  board.append(face);

  const dx = buttons[target].offsetLeft - source.offsetLeft;
  const dy = buttons[target].offsetTop - source.offsetTop;
  const settleDelay = slideDurationMs + slideHoldMs;
  const liftedStyle = getComputedStyle(face);
  const lifted = { translate: liftedStyle.translate, boxShadow: liftedStyle.boxShadow };
  face.classList.add('settled-tile');
  const settledStyle = getComputedStyle(face);
  const settled = { translate: settledStyle.translate, boxShadow: settledStyle.boxShadow };
  const motion = face.animate(
    [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }],
    { duration: slideDurationMs, easing: 'ease-in-out', fill: 'forwards' },
  );
  const settle = face.animate([lifted, settled], {
    delay: settleDelay,
    duration: slideSettleMs,
    easing: 'ease-out',
    fill: 'both',
  });
  const conceal = destination.animate([{ opacity: 0 }, { opacity: 0 }], settleDelay + slideSettleMs);
  const finish = () => {
    motion.cancel();
    settle.cancel();
    conceal.cancel();
    face.remove();
    activeEffects.delete(finish);
  };
  activeEffects.add(finish);
  settle.onfinish = finish;
}

function animateSuction(target, captured) {
  const destination = buttons[target];
  const vortex = document.createElement('span');
  vortex.className = 'suction-vortex';
  vortex.setAttribute('aria-hidden', 'true');
  destination.append(vortex);

  const timing = { delay: slideDurationMs + suctionPauseMs, duration: 520, fill: 'both' };
  const pulse = vortex.animate(
    [
      { transform: 'scale(.65) rotate(0deg)', opacity: 0 },
      { transform: 'scale(1.65) rotate(90deg)', opacity: 1, offset: .25 },
      { transform: 'scale(1.12) rotate(245deg)', opacity: .9, offset: .78 },
      { transform: 'scale(.32) rotate(390deg)', opacity: 0 },
    ],
    timing,
  );
  const pieces = captured.map((index) => {
    const source = buttons[index];
    const piece = document.createElement('span');
    piece.className = 'tile-face suction-piece';
    piece.setAttribute('aria-hidden', 'true');
    showTileText(piece, tiles.fixed, index);
    source.append(piece);

    const dx = destination.offsetLeft - source.offsetLeft;
    const dy = destination.offsetTop - source.offsetTop;
    const motion = piece.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'none' },
        {
          transform: 'translate(0, 0) scale(1)',
          opacity: 1,
          filter: 'drop-shadow(0 0 5px #80ddff)',
          offset: .14,
        },
        {
          transform: `translate(${dx * .55 - dy * .24}px, ${dy * .55 + dx * .24}px) rotate(65deg) scale(.62)`,
          opacity: .95,
          filter: 'drop-shadow(0 0 10px #a48aff)',
          offset: .6,
        },
        {
          transform: `translate(${dx}px, ${dy}px) rotate(160deg) scale(.06)`,
          opacity: 0,
          filter: 'drop-shadow(0 0 12px #ddfcff)',
        },
      ],
      { ...timing, easing: 'cubic-bezier(.45, 0, .75, .6)' },
    );
    return { piece, motion };
  });
  const finish = () => {
    pulse.cancel();
    vortex.remove();
    for (const { piece, motion } of pieces) {
      motion.cancel();
      piece.remove();
    }
    activeEffects.delete(finish);
  };
  activeEffects.add(finish);
  pulse.onfinish = finish;
}

function animateClear(index) {
  if (reducedMotion.matches) return;
  const button = buttons[index];
  const tile = tiles[cells[index]];
  const overlay = document.createElement('span');
  overlay.className = 'clearing-tile';
  overlay.setAttribute('aria-hidden', 'true');
  showTileText(overlay, tile, index);

  button.querySelector('.clearing-tile')?.remove();
  button.append(overlay);
  const timeout = setTimeout(() => overlay.remove(), rules.clearAnimationTimeoutMs);
  overlay.addEventListener(
    'animationend',
    () => {
      clearTimeout(timeout);
      overlay.remove();
    },
    { once: true },
  );
}

function render() {
  boardResult.hidden = result === null;
  boardResult.textContent = result ?? '';
  score.textContent = format(copy.score, { merged, groups: groupCount });
  moveCount.textContent = String(moves);
  const selectedTile = selected === null ? null : cells[selected];
  cells.forEach((tile, index) => {
    const button = buttons[index];
    const style = tiles[tile];
    const destination =
      selected !== null &&
      canSlideTo(selected, index) &&
      moves + (rules.countDistance ? slideDistance(selected, index) : 1) <= moveLimit;
    const partner =
      tile !== null &&
      tile !== 'black' &&
      tile !== 'fixed' &&
      tile === selectedTile &&
      index !== selected;
    button.className = 'cell';
    button.classList.toggle('empty', tile === null);
    button.classList.toggle('destination', destination);
    button.classList.toggle('fixed', tile === 'fixed');
    button.classList.toggle('partner', partner);
    showTileText(button.firstElementChild, style, index);
    if (tile !== null && tile !== 'black') button.querySelector('.clearing-tile')?.remove();
    const label = tileLabels.get(index);
    const hideLabel = !label?.organ && index !== selected && !partner;
    const description = label ? label.type + (hideLabel ? '' : ', ' + plainLabel(label.text)) : '';
    button.title = description;
    button.setAttribute(
      'aria-label',
      (tile === 'fixed'
        ? copy.fixedTile
        : tile === 'black'
          ? copy.blackTile
          : tile === null
            ? copy.emptyTile
            : description || format(copy.tile, { number: style.symbol })) +
        ', ' +
        format(copy.position, { row: Math.floor(index / size) + 1, column: (index % size) + 1 }) +
        (destination ? ', ' + copy.destination : '') +
        (partner ? ', ' + copy.matching : ''),
    );
    if (tile === null || tile === 'fixed') button.removeAttribute('aria-pressed');
    else button.setAttribute('aria-pressed', String(selected === index));
  });
}

let drag = null;
let suppressClick = false;

board.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  suppressClick = false;
  const button = event.target.closest('.cell');
  if (!button || result) return;
  const source = Number(button.dataset.index);
  if (cells[source] === null || cells[source] === 'fixed') return;
  drag = { pointerId: event.pointerId, source, x: event.clientX, y: event.clientY, active: false };
});

board.addEventListener('pointermove', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < rules.dragThreshold) return;
    drag.active = true;
    suppressClick = true;
    board.setPointerCapture(event.pointerId);
    if (selected !== drag.source) play(drag.source);

    const source = buttons[drag.source];
    const tile = cells[drag.source];
    const preview = document.createElement('div');
    preview.className = 'drag-tile';
    preview.setAttribute('aria-hidden', 'true');
    showTileText(preview, tiles[tile], drag.source);
    preview.style.width = source.offsetWidth + 'px';
    preview.style.height = source.offsetHeight + 'px';
    source.classList.add('drag-source');
    drag.preview = preview;
    document.body.append(preview);
  }
  drag.preview.style.left = event.clientX + 'px';
  drag.preview.style.top = event.clientY + 'px';
});

function finishDrag() {
  if (drag?.preview) {
    drag.preview.remove();
    buttons[drag.source].classList.remove('drag-source');
  }
  drag = null;
}

board.addEventListener('pointerup', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const { source, active } = drag;
  const button = active
    ? document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell')
    : null;
  finishDrag();
  if (button && board.contains(button) && canSlideTo(source, Number(button.dataset.index))) {
    selected = source;
    play(Number(button.dataset.index));
  }
});

function cancelDrag(event) {
  if (drag?.pointerId === event.pointerId) finishDrag();
}

board.addEventListener('pointercancel', cancelDrag);
board.addEventListener('lostpointercapture', cancelDrag);
board.addEventListener('pointerleave', (event) => {
  if (!drag?.active) cancelDrag(event);
});
board.addEventListener(
  'click',
  (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.stopPropagation();
  },
  true,
);

shuffle.addEventListener('click', () => {
  finishDrag();
  newBoard();
});
newBoard();
