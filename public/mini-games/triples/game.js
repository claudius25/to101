'use strict';

const { rules, copy, art, families, difficulty, factFonts } = TRIPLES_SETTINGS;
const difficultyProfiles = difficulty.levels.map((level) => ({
  size: level.size ?? rules.size,
  groupSize: level.groupSize,
  moveLimit: level.moveLimit ?? Math.max(1, Math.round(rules.moveLimit * level.moveMultiplier)),
  holeMilestones: level.holeMilestones ?? [],
  diamondWindow: level.diamondWindow,
}));
let activeProfile = difficultyProfiles[difficulty.initialIndex];
let { size, moveLimit } = activeProfile;
let nextHole = 0;
let diamondAt = null;
let diamondPosition = null;
let diamondCollected = false;
function countGroups(groupSize, boardSize = size) {
  return Math.min(
    families.length,
    Math.floor((boardSize * boardSize - 1 - rules.minimumEmptyTiles) / groupSize),
  );
}

if (
  difficultyProfiles.some(({ size, moveLimit, groupSize = 3 }) =>
    !Number.isInteger(size) || size < 2 || ![3, 4].includes(groupSize) ||
    countGroups(groupSize, size) < 1 ||
    !Number.isInteger(moveLimit) || moveLimit < 1,
  ) ||
  !Number.isInteger(rules.moveLimit) ||
  rules.moveLimit < 1 ||
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
const organFact = document.querySelector('#organ-fact');
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
tiles.fixed = { color: art.fixed.color };

const board = document.querySelector('#board');
const gameLayout = document.querySelector('.game-layout');
const boardResult = document.querySelector('#board-result');
const moveCount = document.querySelector('#move-count');
const movesLabel = document.querySelector('#moves-label');
movesLabel.textContent = copy.moveLabel;
const status = document.querySelector('#status');
const shuffle = document.querySelector('#shuffle');
shuffle.title = copy.newBoard;
const groupSizeControl = document.querySelector('#group-size');
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

function adjacent(first, second, boardSize = size) {
  return (
    Math.abs(Math.floor(first / boardSize) - Math.floor(second / boardSize)) +
      Math.abs((first % boardSize) - (second % boardSize)) ===
    1
  );
}

function connectedTiles(layout, start) {
  const color = layout[start];
  if (!isMovable(color) || color === 'black') return [];
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

function prepareBoard(profile) {
  finishDrag();
  movesLabel.classList.remove('moves-label-leaving', 'moves-label-hidden');
  for (const finish of activeEffects) finish();
  activeProfile = profile;
  ({ size, moveLimit } = activeProfile);
  nextHole = 0;
  gameLayout.style.setProperty('--size', size);
  board.setAttribute('aria-label', format(copy.board, { size }));
  while (buttons.length > size * size) buttons.pop().remove();
  while (buttons.length < size * size) buttons.push(createCellButton(buttons.length));
  const fourTilesOption = groupSizeControl.querySelector('option[value="4"]');
  fourTilesOption.disabled = countGroups(4) < 1;
  if (fourTilesOption.disabled) groupSizeControl.value = '3';
  groupSize = profile.groupSize ?? Number(groupSizeControl.value);
  groupCount = countGroups(groupSize);
  board.querySelectorAll('.hole-dust').forEach((effect) => effect.remove());
}

function setTileLabel(position, familyIndex, role) {
  const family = families[familyIndex];
  tileLabels.set(position, {
    role,
    text: role === 3 ? family.organ : examples[familyIndex][role],
    type: labelTypes[role],
    organ: role === 0 ? family.art : null,
    fact: family.facts[role],
  });
}

function rollDiamondMove(window) {
  if (!window) return null;
  const [first, last] = window;
  return first + Math.floor(Math.random() * (last - first + 1));
}

function newBoard(profile = activeProfile) {
  prepareBoard(profile);
  diamondAt = rollDiamondMove(profile.diamondWindow);
  diamondPosition = null;
  diamondCollected = false;
  const emptyCount = size * size - groupCount * groupSize - 1;
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
  cells = bestBoard;
  tileLabels.clear();
  colors.forEach((color, index) => {
    const positions = cells.flatMap((tile, position) => (tile === color ? [position] : []));
    // Shuffle the labels within each color so their roles are independent of position.
    shuffleInPlace(positions);
    positions.forEach((position, role) => setTileLabel(position, index, role));
  });
  selected = null;
  moves = 0;
  merged = 0;
  result = null;
  organFact.textContent = '';
  render();
  status.textContent = copy.ready;
  saveTriplesRun();
}

function isMovable(tile) {
  return tile != null && tile !== 'fixed' && tile !== 'hole';
}

function canSlideTo(source, target) {
  if (
    source === target ||
    !isMovable(cells[source]) ||
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

function placeHole() {
  const open = cells.flatMap((tile, index) => tile === null && index !== diamondPosition ? [index] : []);
  for (const index of shuffleInPlace(open)) {
    cells[index] = 'hole';
    if (cells.some((_, source) => canSlide(source))) return true;
    cells[index] = null;
  }
  return false;
}

function addDueHoles() {
  const { holeMilestones } = activeProfile;
  while (moves >= holeMilestones[nextHole]) {
    if (!placeHole()) return;
    nextHole++;
  }
}
function slideDistance(source, target) {
  return (
    Math.abs(Math.floor(source / size) - Math.floor(target / size)) +
    Math.abs((source % size) - (target % size))
  );
}

function showOrganFact(index) {
  const fact = tileLabels.get(index)?.fact;
  if (!fact || organFact.textContent === fact) return;
  organFact.textContent = fact;
}

function play(index, route) {
  if (result) return;
  let slide;
  let mergeFollowers;
  const captured = [];
  let suctionTarget = index;
  let formationDelay = 0;
  if (cells[index] === 'fixed' || cells[index] === 'hole') {
    selected = null;
    status.textContent = cells[index] === 'hole' ? copy.hole : copy.fixed;
  } else if (isMovable(cells[index])) {
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
    const previousMoves = moves;
    moves += distance;
    if (previousMoves === 0) movesLabel.classList.add('moves-label-leaving');
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
      if (slide) {
        mergeFollowers = group.filter((target) => target !== index).map((target) => ({
          face: makeSlidingFace(tiles[cells[target]], tileLabels.get(target)?.organ),
          source: buttons[target],
        }));
      }
      for (const target of group) {
        if (target === index) continue;
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

    const pickedUpDiamond = index === diamondPosition && cells[index] === 'black';
    if (pickedUpDiamond) {
      diamondPosition = null;
      diamondCollected = true;
    }
    const grayCost = diamondCollected ? 0 : rules.blackGrayMoveCost;
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
          formationDelay = slide ? mergeTiming(slide.duration, group.length - 1).reveal : 0;
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

    if (pickedUpDiamond) status.textContent = copy.diamondCollected;
    if (merged < groupCount && moves < moveLimit) {
      if (diamondAt !== null && moves >= diamondAt) {
        const lastMove = activeProfile.diamondWindow[1];
        if (previousMoves <= lastMove) {
          const open = cells.flatMap((tile, position) => tile === null ? [position] : []);
          diamondPosition = open[Math.floor(Math.random() * open.length)] ?? null;
        }
        if (diamondPosition !== null || moves >= lastMove) diamondAt = null;
      }
      addDueHoles();
    }
    if (merged === groupCount) {
      result = 'win';
    } else if (moves === moveLimit) {
      result = 'loss';
      status.textContent = format(copy.loss, { limit: moveLimit });
    } else if (!cells.some((_, target) => canSlide(target))) {
      result = 'loss';
      status.textContent = copy.stuck;
    }
    saveTriplesRun();
  } else {
    status.textContent = copy.invalid;
  }
  render();
  if (slide) {
    if (mergeFollowers) {
      animateMerge(board, slide.face, buttons[slide.source], buttons[slide.target], slide.duration, mergeFollowers);
    } else {
      animateSlide(slide);
    }
    if (captured.length) animateSuction(suctionTarget, captured, formationDelay, slide.duration);
  }
}

const buttons = [];
function createCellButton(index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.index = index;
  const face = document.createElement('span');
  face.className = 'tile-face';
  button.append(face);
  button.addEventListener('click', () => {
    play(index);
    if (selected === index) showOrganFact(index);
  });
  board.append(button);
  return button;
}

function showTileFace(element, tile, organ) {
  element.classList.toggle('black-piece', tile?.kind === 'black');
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

function makeSlidingFace(tile, organ) {
  const face = document.createElement('span');
  face.className = 'sliding-tile';
  face.setAttribute('aria-hidden', 'true');
  showTileFace(face, tile, organ);
  return face;
}

function prepareSlide(source, target, alreadyAtTarget) {
  if (reducedMotion.matches) return null;
  return {
    face: makeSlidingFace(tiles[cells[source]], tileLabels.get(source)?.organ),
    source: alreadyAtTarget ? target : source,
    target,
    duration: alreadyAtTarget ? 0 : slideDurationMs,
  };
}

function positionSlidingFace(surface, face, source) {
  face.style.left = `${source.offsetLeft}px`;
  face.style.top = `${source.offsetTop}px`;
  face.style.width = `${source.offsetWidth}px`;
  face.style.height = `${source.offsetHeight}px`;
  surface.append(face);
}

function animateSlide({ face, source: sourceIndex, target, duration }) {
  const source = buttons[sourceIndex];
  const destination = buttons[target].firstElementChild;
  positionSlidingFace(board, face, source);
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

function mergeTiming(travel, followerCount) {
  const gather = travel + 115;
  const charge = gather + 270 + (followerCount - 1) * 235 + 50;
  const pop = charge + 154;
  return { gather, charge, pop, burst: pop + 72, reveal: pop + 133, end: pop + 205 };
}

function getMergeRoutes(surface, target, followers, boardSize) {
  const squares = Array.from(surface.querySelectorAll(':scope > .cell'));
  const ordered = [{ square: target, path: [] }];
  const visited = new Set([target]);
  for (const { square, path } of ordered) {
    for (const follower of followers) {
      if (visited.has(follower.source) ||
          !adjacent(squares.indexOf(square), squares.indexOf(follower.source), boardSize)) continue;
      visited.add(follower.source);
      ordered.push({ square: follower.source, path: [square, ...path], face: follower.face });
    }
  }
  return ordered.slice(1);
}

function animateMerge(surface, lead, source, target, travelDuration, followers, boardSize = size) {
  const routes = getMergeRoutes(surface, target, followers, boardSize);
  const timing = mergeTiming(travelDuration, followers.length);
  const offset = (time) => time / timing.end;
  const lift = Math.max(22, target.offsetWidth * .4);
  const peek = Math.max(6, target.offsetWidth * .1);
  const dx = target.offsetLeft - source.offsetLeft;
  const dy = target.offsetTop - source.offsetTop;
  const animations = [];
  const faces = [lead, ...followers.map(({ face }) => face)];
  animations.push(target.firstElementChild.animate(
    [
      { opacity: 0, transform: 'scale(0)' },
      { opacity: 1, transform: 'scale(1.12)', offset: .6 },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { delay: timing.reveal, duration: 270, fill: 'backwards', easing: 'ease-out' },
  ));

  positionSlidingFace(surface, lead, source);
  lead.classList.add('merge-lead', 'settled-tile');
  const raised = (y, scale) => `translate(${dx}px, ${dy - y}px) scale(${scale})`;
  animations.push(lead.animate(
    [
      { transform: 'translate(0, 0)', easing: 'ease-in-out' },
      { transform: raised(0, '1'), offset: offset(travelDuration), easing: 'ease-out' },
      { transform: raised(lift, '1.14'), offset: offset(travelDuration + 192) },
      { transform: raised(lift, '1.14'), filter: 'brightness(1)', offset: offset(timing.charge) },
      { transform: raised(lift - 2, '1.22, 1.06'), filter: 'brightness(1.3)', offset: offset(timing.charge + 54) },
      { transform: raised(lift + 2, '1.08, 1.22'), offset: offset(timing.charge + 108) },
      { transform: raised(lift + 2, '1.18'), offset: offset(timing.pop) },
      { transform: raised(lift + 2, '1.34'), filter: 'brightness(1.55)', offset: offset(timing.burst), easing: 'ease-in' },
      { transform: raised(lift + 2, '0'), opacity: 0 },
    ],
    { duration: timing.end, fill: 'forwards' },
  ));

  for (const [index, { face, square: partner, path }] of routes.entries()) {
    positionSlidingFace(surface, face, partner);
    face.classList.add('settled-tile');
    face.style.zIndex = String(3 - index);
    const delay = timing.gather + index * 235;
    const x = target.offsetLeft - partner.offsetLeft;
    const y = target.offsetTop - partner.offsetTop - lift + (index + 1) * peek;
    const stacked = `translate(${x}px, ${y}px) scale(${1 - (index + 1) * .07})`;
    const frames = [
      { transform: 'translate(0, 0)', offset: 0 },
      { transform: 'translate(0, 0)', offset: offset(delay), easing: 'ease-in-out' },
    ];
    path.forEach((waypoint, step) => {
      const stepX = waypoint.offsetLeft - partner.offsetLeft;
      const stepY = waypoint.offsetTop - partner.offsetTop;
      frames.push({
        transform: `translate(${stepX}px, ${stepY}px)`,
        offset: offset(delay + (step + 1) * 205 / path.length),
        easing: 'ease-in-out',
      });
    });
    frames.push(
      { transform: stacked, offset: offset(delay + 270) },
      { transform: stacked, offset: offset(timing.pop), easing: 'ease-in' },
      { transform: `translate(${x}px, ${y - peek}px) scale(0)`, opacity: 0 },
    );
    animations.push(face.animate(frames, { duration: timing.end, fill: 'forwards' }));
  }

  const { layer, effects } = animateMergeConfetti(target, lift, lead.style.getPropertyValue('--tile'), timing.burst);
  animations.push(...effects);
  return new Promise((resolve) => {
    const finish = () => {
      for (const animation of animations) animation.cancel();
      for (const face of faces) face.remove();
      layer.remove();
      activeEffects.delete(finish);
      resolve();
    };
    activeEffects.add(finish);
    animations.at(-1).onfinish = finish;
  });
}

function animateMergeConfetti(target, lift, color, delay) {
  const layer = document.createElement('span');
  layer.className = 'merge-confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const burst = document.createElement('span');
  burst.className = 'merge-confetti';
  const rect = target.getBoundingClientRect();
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2 - lift}px`;
  burst.style.setProperty('--merge-color', color);
  layer.append(burst);
  document.body.append(layer);

  const flash = document.createElement('span');
  const ring = document.createElement('span');
  flash.className = 'merge-flash';
  ring.className = 'merge-ring';
  burst.append(flash, ring);
  const expand = (element, scale, duration) => element.animate(
    [{ opacity: 1, scale: .35 }, { opacity: 0, scale }],
    { delay, duration, easing: 'ease-out' },
  );
  const effects = [expand(flash, 2, 240), expand(ring, 2.6, 420)];

  for (let index = 0; index < 48; index++) {
    const particle = document.createElement('i');
    burst.append(particle);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(55, rect.width * .8) * (1 + Math.random() * 1.5);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * .85 - 28;
    const fall = 65 + Math.random() * 80;
    const spin = Math.random() * 720 - 360;
    effects.push(particle.animate(
      [
        { opacity: 1, transform: 'scale(.55)', easing: 'cubic-bezier(.1,.8,.3,1)' },
        { opacity: 1, transform: `translate(${x}px, ${y}px) rotate(${spin / 2}deg) rotateX(${spin * .8}deg)`,
          offset: .4, easing: 'cubic-bezier(.45,0,1,1)' },
        { opacity: 0, transform: `translate(${x * 1.2}px, ${y + fall}px) rotate(${spin}deg) rotateX(${spin * 2}deg) scale(.85)` },
      ],
      { delay: delay + Math.random() * 38, duration: 610 + Math.random() * 416 },
    ));
  }
  effects.push(layer.animate([{ opacity: 1 }, { opacity: 1 }], delay + 1080));
  return { layer, effects };
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
    showTileFace(piece, tiles.fixed);
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

function render(animateNewHoles = true) {
  boardResult.hidden = result === null;
  boardResult.textContent = result ? copy[result === 'win' ? 'winTitle' : 'lossTitle'] : '';
  if (result) board.dataset.result = result;
  else delete board.dataset.result;
  moveCount.textContent = String(moveLimit - moves);
  movesLabel.classList.toggle('moves-label-hidden', moves > 0);
  const selectedTile = selected === null ? null : cells[selected];
  cells.forEach((tile, index) => {
    const button = buttons[index];
    const style = tiles[tile];
    const destination =
      selected !== null &&
      canSlideTo(selected, index) &&
      moves + (rules.countDistance ? slideDistance(selected, index) : 1) <= moveLimit;
    const partner =
      isMovable(tile) &&
      tile !== 'black' &&
      tile === selectedTile &&
      index !== selected;
    const newHole = tile === 'hole' && !button.classList.contains('hole');
    button.className = 'cell';
    button.classList.toggle('empty', tile === null);
    button.classList.toggle('fixed', tile !== null && !isMovable(tile));
    button.classList.toggle('hole', tile === 'hole');
    button.classList.toggle('diamond', index === diamondPosition);
    button.classList.toggle('powered-black', tile === 'black' && diamondCollected);
    button.classList.toggle('partner', partner);
    showTileFace(button.firstElementChild, style, tileLabels.get(index)?.organ);
    if (newHole && animateNewHoles && !reducedMotion.matches) {
      const dust = document.createElement('span');
      dust.className = 'hole-dust';
      dust.setAttribute('aria-hidden', 'true');
      dust.addEventListener('animationend', () => dust.remove(), { once: true });
      button.append(dust);
    }
    const label = tileLabels.get(index);
    const hideLabel = !label?.organ && index !== selected && !partner;
    const description = label ? label.type + (hideLabel ? '' : ', ' + plainLabel(label.text)) : '';
    button.setAttribute(
      'aria-label',
      (tile === 'fixed'
        ? copy.fixedTile
        : tile === 'hole'
          ? copy.holeTile
          : tile === 'black'
            ? diamondCollected ? copy.poweredBlackTile : copy.blackTile
            : tile === null
              ? copy.emptyTile
              : description || format(copy.tile, { number: style.symbol })) +
        ', ' +
        format(copy.position, { row: Math.floor(index / size) + 1, column: (index % size) + 1 }) +
        (index === diamondPosition ? ', ' + copy.diamondTile : '') +
        (destination ? ', ' + copy.destination : '') +
        (partner ? ', ' + copy.matching : ''),
    );
    if (!isMovable(tile)) button.removeAttribute('aria-pressed');
    else button.setAttribute('aria-pressed', String(selected === index));
  });
}

let drag = null;
let suppressClick = false;

function canFollowRoute(route) {
  const source = cells[route[0]];
  return isMovable(source) && route.slice(1).every(
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
  showTileFace(preview, tile, tileLabels.get(drag.source)?.organ);
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
  if (!isMovable(cells[source])) return;
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
  if (!drag || (event && drag.pointerId !== event.pointerId)) return;
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
window.addEventListener('resize', () => {
  const pointerId = drag?.pointerId;
  cancelDrag();
  if (pointerId !== undefined && board.hasPointerCapture(pointerId)) {
    board.releasePointerCapture(pointerId);
  }
  for (const finish of activeEffects) finish();
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

const difficultyInput = document.querySelector('#difficulty');
const difficultyCurrent = document.querySelector('#difficulty-current');
const fontInput = document.querySelector('#fact-font');
const fontPreview = document.querySelector('#fact-font-preview');
const fontSizeInput = document.querySelector('#fact-font-size');
const fontSizeValue = document.querySelector('#fact-font-size-value');
const equalTileGaps = document.querySelector('#equal-tile-gaps');
const main = document.querySelector('main');
const lastDifficultyIndex = difficulty.levels.length - 1;
difficultyInput.max = lastDifficultyIndex;
difficultyInput.value = difficulty.initialIndex;
fontInput.max = factFonts.length - 1;
fontInput.value = 0;

function updateSlider(input, label) {
  input.setAttribute('aria-valuetext', label);
  const min = Number(input.min);
  const progress = (input.valueAsNumber - min) / (Number(input.max) - min) * 100;
  input.parentElement.style.setProperty('--range-progress', `${progress}%`);
}

function showDifficulty() {
  const index = difficultyInput.valueAsNumber;
  const { label } = difficulty.levels[index];
  updateSlider(difficultyInput, label);
  difficultyCurrent.textContent = label;
}

function showFactFont() {
  const font = factFonts[fontInput.valueAsNumber];
  updateSlider(fontInput, font);
  main.style.setProperty('--fact-font', `"${font}"`);
  fontPreview.textContent = font;
}

function showFactFontSize() {
  const size = fontSizeInput.valueAsNumber;
  updateSlider(fontSizeInput, `${size} pixels`);
  main.style.setProperty('--fact-font-size', `${size}px`);
  fontSizeValue.textContent = `${size} px`;
}

function updateTileGap() {
  gameLayout.classList.toggle('equal-gaps', equalTileGaps.checked);
}

const triplesRunKey = 'triples.activeRun.v1';

function saveTriplesRun() {
  if (main.hidden) return;
  const snapshot = JSON.stringify({
    difficulty: difficultyProfiles.indexOf(activeProfile),
    queuedDifficulty: difficultyInput.valueAsNumber,
    factFont: factFonts[fontInput.valueAsNumber],
    factFontSize: fontSizeInput.valueAsNumber,
    equalTileGaps: equalTileGaps.checked,
    size, moveLimit, groupSize, moves, merged, result, nextHole, cells,
    diamondAt, diamondPosition, diamondCollected,
    roles: cells.map((_, index) => tileLabels.get(index)?.role ?? null),
    status: status.textContent,
  });
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'triples:save-run', snapshot }, '*');
    return;
  }
  try {
    sessionStorage.setItem(triplesRunKey, snapshot);
  } catch {
    // The current run can still be played without storage.
  }
}

function restoreTriplesRun(snapshot, freshBoard = false) {
  let saved;
  try {
    saved = JSON.parse(snapshot);
  } catch {
    return false;
  }
  const profile = difficultyProfiles[saved?.difficulty];
  if (profile?.diamondWindow && Array.isArray(saved.cells) && saved.diamondPosition === undefined) {
    const oldPosition = saved.cells.indexOf('diamond');
    if (oldPosition !== -1) {
      saved.cells[oldPosition] = null;
      saved.diamondPosition = oldPosition;
    }
  }
  if (
    !profile || saved.size !== profile.size || saved.moveLimit !== profile.moveLimit ||
    ![3, 4].includes(saved.groupSize) || countGroups(saved.groupSize, profile.size) < 1 ||
    (profile.groupSize !== undefined && saved.groupSize !== profile.groupSize) ||
    !Number.isInteger(saved.moves) || saved.moves < 0 || saved.moves > profile.moveLimit ||
    !Number.isInteger(saved.merged) || saved.merged < 0 ||
    saved.merged > countGroups(saved.groupSize, profile.size) ||
    ![null, 'win', 'loss'].includes(saved.result) ||
    !Number.isInteger(saved.nextHole) || saved.nextHole < 0 ||
    saved.nextHole > profile.holeMilestones.length ||
    !Array.isArray(saved.cells) || saved.cells.length !== profile.size ** 2 ||
    (saved.diamondPosition != null && (!profile.diamondWindow ||
      !Number.isInteger(saved.diamondPosition) || saved.diamondPosition < 0 ||
      saved.diamondPosition >= saved.cells.length || saved.cells[saved.diamondPosition] === 'hole')) ||
    !Array.isArray(saved.roles) || saved.roles.length !== saved.cells.length ||
    saved.cells.some((tile, index) =>
      isMovable(tile) && tile !== 'black'
        ? !colors.includes(tile) || !Number.isInteger(saved.roles[index]) ||
          saved.roles[index] < 0 || saved.roles[index] >= saved.groupSize
        : ![null, 'fixed', 'hole', 'black'].includes(tile),
    )
  ) return false;

  if (profile.groupSize === undefined) groupSizeControl.value = String(saved.groupSize);
  difficultyInput.value = difficultyProfiles[saved.queuedDifficulty] ? saved.queuedDifficulty : saved.difficulty;
  showDifficulty();
  fontInput.value = Math.max(0, factFonts.indexOf(saved.factFont));
  showFactFont();
  fontSizeInput.value = Number.isInteger(saved.factFontSize) ? saved.factFontSize : fontSizeInput.defaultValue;
  showFactFontSize();
  equalTileGaps.checked = (saved.equalTileGaps ?? saved.removeTileGaps) === true;
  updateTileGap();
  if (freshBoard) {
    newBoard(profile);
    return true;
  }

  prepareBoard(profile);
  ({ cells, moves, merged, result, nextHole } = saved);
  diamondCollected = Boolean(profile.diamondWindow && saved.diamondCollected === true);
  diamondPosition = diamondCollected ? null : saved.diamondPosition ?? null;
  diamondAt = null;
  if (profile.diamondWindow && !diamondCollected && diamondPosition === null) {
    const [first, last] = profile.diamondWindow;
    if (Number.isInteger(saved.diamondAt) && saved.diamondAt >= first && saved.diamondAt <= last) {
      diamondAt = saved.diamondAt;
    } else if (saved.diamondAt !== null && moves < last) {
      diamondAt = rollDiamondMove(profile.diamondWindow);
    }
  }
  selected = null;
  tileLabels.clear();
  cells.forEach((tile, index) => {
    if (isMovable(tile) && tile !== 'black') setTileLabel(index, colors.indexOf(tile), saved.roles[index]);
  });
  render(false);
  status.textContent = typeof saved.status === 'string' ? saved.status : copy.ready;
  return true;
}

difficultyInput.addEventListener('input', () => {
  showDifficulty();
  saveTriplesRun();
});
showDifficulty();
fontInput.addEventListener('input', () => {
  showFactFont();
  saveTriplesRun();
});
showFactFont();
fontSizeInput.addEventListener('input', () => {
  showFactFontSize();
  saveTriplesRun();
});
showFactFontSize();
equalTileGaps.addEventListener('change', () => {
  for (const finish of activeEffects) finish();
  updateTileGap();
  saveTriplesRun();
});
updateTileGap();

const settingsDialog = document.querySelector('#settings-dialog');
const settingsOpen = document.querySelector('#settings-open');
const settingsClose = document.querySelector('#settings-close');
const settingsOffscreen = 'translateY(calc(-100% - 16px))';
let settingsEntrance;
let settingsClosing = false;

settingsOpen.addEventListener('click', () => {
  if (settingsDialog.open) return;
  settingsDialog.showModal();
  if (!reducedMotion.matches) {
    settingsEntrance = settingsDialog.animate(
      [{ transform: settingsOffscreen }, { transform: 'none' }],
      { duration: 240, easing: 'ease-out' },
    );
  }
});

function closeSettings() {
  if (!settingsDialog.open || settingsClosing) return;
  if (reducedMotion.matches) {
    settingsEntrance?.cancel();
    settingsDialog.close();
    return;
  }
  settingsClosing = true;
  const start = getComputedStyle(settingsDialog).transform;
  settingsEntrance?.cancel();
  const exit = settingsDialog.animate(
    [{ transform: start }, { transform: settingsOffscreen }],
    { duration: 200, easing: 'ease-in', fill: 'forwards' },
  );
  exit.onfinish = () => {
    settingsDialog.close();
    exit.cancel();
    settingsClosing = false;
  };
}

settingsClose.addEventListener('click', closeSettings);
settingsDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSettings();
});
shuffle.addEventListener('click', () => {
  if (settingsClosing) return;
  newBoard(difficultyProfiles[difficultyInput.valueAsNumber]);
  closeSettings();
});
groupSizeControl.addEventListener('change', () => newBoard());
newBoard();
