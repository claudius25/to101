'use strict';

const { rules, copy, art, families } = TRIPLES_SETTINGS;
const { size, moveLimit } = rules;
function countGroups(groupSize) {
  return Math.min(
    families.length,
    Math.floor((size * size - 1 - rules.minimumEmptyTiles) / groupSize),
  );
}

if (
  !Number.isInteger(size) ||
  countGroups(3) < 1 ||
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
const instructions = document.querySelector('#instructions');
const mobileOrganDisplay = document.querySelector('#mobile-organ-display');
mobileOrganDisplay.hidden = size < 4;
const factPositions = new Map();
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
        symbol: String(index + 1),
      },
    ];
  }),
);
tiles.black = { color: art.black.color, kind: 'black' };
tiles.fixed = { color: art.fixed.color, kind: 'fixed' };

const board = document.querySelector('#board');
const boardResult = document.querySelector('#board-result');
document.querySelector('main').style.setProperty('--size', size);
board.setAttribute('aria-label', format(copy.board, { size }));
const moveCount = document.querySelector('#move-count');
document.querySelector('#moves-label').textContent = copy.moveLabel;
const status = document.querySelector('#status');
const shuffle = document.querySelector('#shuffle');
shuffle.setAttribute('aria-label', copy.newBoard);
shuffle.title = copy.newBoard;
const groupSizeControl = document.querySelector('#group-size');
groupSizeControl.querySelector('option[value="4"]').disabled = countGroups(4) < 1;
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
let groupSize;
let groupCount;

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
  finishDrag();
  factPositions.clear();
  mobileOrganDisplay.textContent = '';
  for (const finish of activeEffects) finish();
  groupSize = Number(groupSizeControl.value);
  groupCount = countGroups(groupSize);
  const emptyCount = size * size - groupCount * groupSize - 1;
  instructions.textContent = [
    copy.instructions,
    rules.blackClearsGray ? format(copy.blackRule, { cost: rules.blackGrayMoveCost }) : '',
    format(copy.goal, { groups: groupCount, limit: moveLimit }),
  ].filter(Boolean).join(' ');
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
        text: role === 3 ? families[index].organ : examples[index][role],
        type: labelTypes[role],
        organ: role === 0 ? families[index].art : null,
        family: families[index],
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
  for (let index = source; index !== target; index += step) {
    const next = index + step;
    if (cells[next] !== null) return false;
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

function showOrganFact(index) {
  const family = tileLabels.get(index)?.family;
  if (family) {
    const position = factPositions.get(family.id) ?? 0;
    mobileOrganDisplay.textContent = family.facts[position];
    factPositions.set(family.id, (position + 1) % family.facts.length);
  }
}

function play(index, route) {
  if (result) return;
  let slide;
  const captured = [];
  let suctionTarget = index;
  let formationDelay = 0;
  if (cells[index] === 'fixed') {
    selected = null;
    status.textContent = copy.fixed;
  } else if (cells[index] !== null) {
    const movable = canSlide(index);
    selected = selected === index ? null : index;
    status.textContent =
      selected === null ? copy.deselected : movable ? copy.chooseEmpty : copy.blocked;
  } else if (selected !== null && (route ? canFollowRoute(route) : canSlideTo(selected, index))) {
    const distance = rules.countDistance ? (route ? route.length - 1 : slideDistance(selected, index)) : 1;
    if (moves + distance > moveLimit) {
      status.textContent = copy.overBudget;
      return;
    }
    for (const finish of activeEffects) finish();
    slide = prepareSlide(selected, index, Boolean(route));
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
    if (rules.blackClearsGray) {
      if (cells[index] === 'black') {
        for (let target = 0; target < cells.length && moves + grayCost <= moveLimit; target++) {
          if (cells[target] !== 'fixed' || !adjacent(index, target)) continue;
          captured.push(target);
          moves += grayCost;
        }
      } else if (matched && moves + grayCost <= moveLimit) {
        const blackIndex = cells.indexOf('black');
        if (adjacent(index, blackIndex)) {
          suctionTarget = blackIndex;
          formationDelay = (slide?.duration ?? 0) + slideHoldMs + slideSettleMs;
          captured.push(index);
          moves += grayCost;
        }
      }
      for (const target of captured) {
        cells[target] = null;
      }
      if (captured.length) {
        const message = format(captured.length === 1 ? copy.grayMoved : copy.grayChain, {
          count: captured.length,
          cost: captured.length * grayCost,
        });
        if (merged !== groupCount) {
          status.textContent = matched ? copy.merged + ' ' + message : message;
        }
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
    if (captured.length) animateSuction(suctionTarget, captured, formationDelay, slide.duration);
  }
}

const buttons = Array.from({ length: size * size }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.index = index;
  const face = document.createElement('span');
  face.className = 'tile-face';
  button.append(face);
  button.addEventListener('click', () => {
    showOrganFact(index);
    play(index);
  });
  board.append(button);
  return button;
});

function showTileFace(element, tile, index) {
  const organ = tileLabels.get(index)?.organ;
  element.classList.toggle('black-piece', tile?.kind === 'black');
  element.classList.toggle('fixed-piece', tile?.kind === 'fixed');
  element.style.setProperty('--tile', tile?.color ?? '');
  element.replaceChildren();
  if (organ) {
    const image = document.createElement('img');
    image.className = 'organ-art';
    image.alt = '';
    image.src = '../../assets/triples/organs/' + organ.image;
    element.append(image);
  }
}

function prepareSlide(source, target, alreadyAtTarget) {
  if (reducedMotion.matches) return null;
  const face = document.createElement('span');
  face.className = 'sliding-tile';
  face.setAttribute('aria-hidden', 'true');
  const tile = tiles[cells[source]];
  showTileFace(face, tile, source);
  return {
    face,
    source: alreadyAtTarget ? target : source,
    target,
    duration: alreadyAtTarget ? 0 : slideDurationMs,
  };
}

function animateSlide({ face, source: sourceIndex, target, duration }) {
  const source = buttons[sourceIndex];
  const destination = buttons[target].firstElementChild;
  face.style.left = `${source.offsetLeft}px`;
  face.style.top = `${source.offsetTop}px`;
  face.style.width = `${source.offsetWidth}px`;
  face.style.height = `${source.offsetHeight}px`;
  board.append(face);

  const dx = buttons[target].offsetLeft - source.offsetLeft;
  const dy = buttons[target].offsetTop - source.offsetTop;
  const settleDelay = duration + slideHoldMs;
  const liftedStyle = getComputedStyle(face);
  const lifted = { translate: liftedStyle.translate, boxShadow: liftedStyle.boxShadow };
  face.classList.add('settled-tile');
  const settledStyle = getComputedStyle(face);
  const settled = { translate: settledStyle.translate, boxShadow: settledStyle.boxShadow };
  const motion = face.animate(
    [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }],
    { duration, easing: 'ease-in-out', fill: 'forwards' },
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

function animateSuction(target, captured, formationDelay, travelDuration) {
  const destination = buttons[target];
  const vortex = document.createElement('span');
  vortex.className = 'suction-vortex';
  vortex.setAttribute('aria-hidden', 'true');
  destination.append(vortex);

  const timing = {
    delay: (formationDelay || travelDuration) + suctionPauseMs,
    duration: 520,
    fill: 'both',
  };
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
    showTileFace(piece, tiles.fixed, index);
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
    const reveal = formationDelay
      ? piece.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: formationDelay,
          duration: 100,
          fill: 'backwards',
        })
      : null;
    return { piece, motion, reveal };
  });
  const finish = () => {
    pulse.cancel();
    vortex.remove();
    for (const { piece, motion, reveal } of pieces) {
      motion.cancel();
      reveal?.cancel();
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
  showTileFace(overlay, tile, index);

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
  moveCount.textContent = String(moveLimit - moves);
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
    button.classList.toggle('fixed', tile === 'fixed');
    button.classList.toggle('partner', partner);
    showTileFace(button.firstElementChild, style, index);
    if (tile !== null && tile !== 'black') button.querySelector('.clearing-tile')?.remove();
    const label = tileLabels.get(index);
    const hideLabel = !label?.organ && index !== selected && !partner;
    const description = label ? label.type + (hideLabel ? '' : ', ' + plainLabel(label.text)) : '';
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

function canFollowRoute(route) {
  const source = cells[route[0]];
  return source !== null && source !== 'fixed' && route.slice(1).every(
    (next, index) => cells[next] === null && adjacent(route[index], next),
  );
}

function cellAtPointer(event) {
  const button = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  return button && board.contains(button) ? Number(button.dataset.index) : null;
}

function cellAtRelease(event) {
  const directHit = cellAtPointer(event);
  if (directHit !== null || event.pointerType !== 'touch') return directHit;

  const current = drag.route.at(-1);
  let target = null;
  let nearestDistance = rules.touchReleasePadding;
  for (const [index, button] of buttons.entries()) {
    const rect = button.getBoundingClientRect();
    const dx = Math.max(rect.left - event.clientX, event.clientX - rect.right, 0);
    const dy = Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0);
    const distance = Math.hypot(dx, dy);
    if (distance > nearestDistance) continue;
    if (distance === nearestDistance && target !== null && index !== current) continue;
    nearestDistance = distance;
    target = index;
  }
  return target;
}

function cellCenter(index) {
  const button = buttons[index];
  return {
    x: button.offsetLeft + button.offsetWidth / 2,
    y: button.offsetTop + button.offsetHeight / 2,
  };
}

function updateDragRoute(target) {
  const current = drag.route.at(-1);
  if (target === null || target === current) return;
  const sameRow = Math.floor(current / size) === Math.floor(target / size);
  if (!sameRow && current % size !== target % size) return;
  const step = Math.sign(target - current) * (sameRow ? 1 : size);
  const route = drag.route.slice();
  for (let index = current; index !== target; index += step) {
    const next = index + step;
    if (next !== drag.source && cells[next] !== null) return;
    const earlier = route.indexOf(next);
    if (earlier === -1) route.push(next);
    else route.length = earlier + 1;
  }
  drag.route = route;
  drawDragRoute();
}

function drawDragRoute() {
  const points = drag.route.map(cellCenter);
  const segments = points.slice(1).map(({ x, y }, index) => {
    const previous = points[index];
    const segment = document.createElement('span');
    segment.style.left = `${previous.x}px`;
    segment.style.top = `${previous.y}px`;
    segment.style.width = `${Math.hypot(x - previous.x, y - previous.y)}px`;
    segment.style.transform = `rotate(${Math.atan2(y - previous.y, x - previous.x)}rad)`;
    return segment;
  });
  drag.trail.replaceChildren(...segments);
}

function positionDragPreview(event, target) {
  const current = drag.route.at(-1);
  const { x, y } = cellCenter(current);
  const rect = board.getBoundingClientRect();
  const followsTouch = event.pointerType === 'touch' &&
    (target === current || (target === null && isOpenDragGap(event, current)));
  drag.preview.style.left = `${followsTouch ? event.clientX : rect.left + x}px`;
  drag.preview.style.top = `${followsTouch ? event.clientY : rect.top + y}px`;
}

function isOpenDragGap(event, current) {
  const from = buttons[current].getBoundingClientRect();
  return [current - size, current - 1, current + 1, current + size].some((next) => {
    if (!buttons[next] || !adjacent(current, next)) return false;
    if (cells[next] !== null && next !== drag.source) return false;
    const to = buttons[next].getBoundingClientRect();
    return event.clientX >= Math.min(from.left, to.left) &&
      event.clientX <= Math.max(from.right, to.right) &&
      event.clientY >= Math.min(from.top, to.top) &&
      event.clientY <= Math.max(from.bottom, to.bottom);
  });
}

function startDrag(event) {
  drag.active = true;
  showOrganFact(drag.source);
  suppressClick = true;
  board.setPointerCapture(event.pointerId);
  const source = buttons[drag.source];
  const tile = tiles[cells[drag.source]];
  const preview = document.createElement('div');
  preview.className = 'drag-tile';
  preview.setAttribute('aria-hidden', 'true');
  showTileFace(preview, tile, drag.source);
  preview.style.width = source.offsetWidth + 'px';
  preview.style.height = source.offsetHeight + 'px';
  source.classList.add('drag-source');
  drag.preview = preview;
  document.body.append(preview);
  drag.trail = document.createElement('div');
  drag.trail.className = 'drag-route';
  drag.trail.setAttribute('aria-hidden', 'true');
  drag.trail.style.setProperty('--route-color', tile.color);
  board.append(drag.trail);
  positionDragPreview(event, drag.source);
}

board.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  suppressClick = false;
  const button = event.target.closest('.cell');
  if (!button || result) return;
  const source = Number(button.dataset.index);
  if (cells[source] === null || cells[source] === 'fixed') return;
  drag = { pointerId: event.pointerId, source, x: event.clientX, y: event.clientY, active: false, route: [source] };
  if (event.pointerType === 'touch') startDrag(event);
});

board.addEventListener('pointermove', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < rules.dragThreshold) return;
    startDrag(event);
  }
  const target = cellAtPointer(event);
  updateDragRoute(target);
  if (drag.route.length > 1 || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= rules.dragThreshold) {
    drag.moved = true;
  }
  positionDragPreview(event, target);
});

function finishDrag() {
  if (drag?.preview) {
    drag.preview.remove();
    drag.trail.remove();
    buttons[drag.source].classList.remove('drag-source');
  }
  drag = null;
}

board.addEventListener('pointerup', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const target = drag.active ? cellAtRelease(event) : null;
  if (drag.active) updateDragRoute(target);
  const { source, active, moved, route } = drag;
  finishDrag();
  if (!active) return;
  if (event.pointerType === 'touch' && !moved && target === source) {
    play(source);
  } else if (target !== source && target === route.at(-1)) {
    selected = source;
    play(target, route);
  } else {
    selected = null;
    status.textContent = copy.deselected;
    render();
  }
});

function cancelDrag(event) {
  if (drag?.pointerId !== event.pointerId) return;
  const { active } = drag;
  finishDrag();
  if (active) {
    selected = null;
    status.textContent = copy.deselected;
    render();
  }
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

shuffle.addEventListener('click', newBoard);
groupSizeControl.addEventListener('change', newBoard);
newBoard();
