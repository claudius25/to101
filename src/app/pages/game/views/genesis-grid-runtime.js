const columns = 17;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const highlightDuration = 520;

export function createGenesisGrid({ rows: rowCount = 17, fontSize, columnSpacing, rowSpacing, sidePadding, nextTraitDelayMs }, initialName, initialFitness, initialFinance, initialType, initialSocial, initialLuck) {
  const rows = Math.max(11, Math.floor(rowCount));
  const wrapRow = (row) => ((row % rows) + rows) % rows;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d');
  const minWidth = columns * Math.max(columnSpacing, fontSize * 0.65) + sidePadding * 2;
  const height = Math.max(510, rows * rowSpacing);
  const top = (height - rows * rowSpacing) / 2;
  const font = `${fontSize}px "IBM Plex Mono", monospace`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const introStart = performance.now();
  let introEnd = reducedMotion.matches ? introStart : introStart + 8 * 580 + 360;
  const grid = Array.from({ length: columns }, () =>
    Array.from({ length: rows }, () => ({
      glyph: alphabet[Math.floor(Math.random() * alphabet.length)],
      shade: 85 + Math.floor(Math.random() * 33),
      introDelay: Math.floor(Math.random() * 9) * 580,
    })),
  );
  const fields = [
    { label: 'NAME', row: 0, value: initialName, highlightStart: null, labelStart: introEnd },
    { label: 'FITNESS', row: 2, value: initialFitness ?? '', highlightStart: null, labelStart: initialName ? introEnd : null },
    { label: 'FINANCE', row: 4, value: initialFinance ?? '', highlightStart: null, labelStart: initialFitness ? introEnd : null },
    { label: 'TYPE', row: 6, value: initialType ?? '', highlightStart: null, labelStart: initialFinance ? introEnd : null },
    { label: 'SOCIAL', row: 8, value: initialSocial ?? '', highlightStart: null, labelStart: initialType ? introEnd : null },
    { label: 'LUCK', row: 10, value: initialLuck ?? '', highlightStart: null, labelStart: initialSocial ? introEnd : null },
  ];
  for (const field of fields) {
    field.value = fitValue(field.value, field.label);
    field.labelSeeded = field.labelStart !== null;
    if (field.labelStart !== null) {
      for (const [col, glyph] of Array.from(field.label).entries()) {
        grid[col][field.row].glyph = glyph;
      }
    }
  }

  let activeField = null;
  let motion = new Map();
  let revealEnd = 0;
  let width = 0;
  let frame = null;
  let disposed = false;
  updateLabel();

  function updateLabel() {
    canvas.setAttribute('aria-label', fields.map(field => `${field.label}: ${field.value || 'roll the dice to reveal'}`).join(', '));
  }

  function fitValue(value, label) {
    return value.toUpperCase().slice(0, columns - label.length - 1);
  }

  function unlockNextField(previous, time) {
    const field = fields[fields.indexOf(previous) + 1];
    if (!field || field.labelStart !== null) return;
    field.labelStart = time + (reducedMotion.matches ? 0 : nextTraitDelayMs);
  }

  function draw(time) {
    for (const field of fields) {
      if (field.labelSeeded || field.labelStart === null || time < field.labelStart) continue;
      for (const [col, glyph] of Array.from(field.label).entries()) {
        grid[col][field.row].glyph = glyph;
      }
      field.labelSeeded = true;
    }
    const gridWidth = width - sidePadding * 2;
    const step = gridWidth / columns;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sidePadding, top, gridWidth, rows * rowSpacing);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 ' + font;

    grid.forEach((cells, col) => {
      const slide = motion.get(col);
      const progress = slide ? Math.min(1, Math.max(0, (time - slide.start) / slide.duration)) : 0;
      const offset = slide ? slide.shift * (1 - (1 - progress) ** 3) : 0;
      const x = sidePadding + (col + 0.5) * step;
      cells.forEach((cell, row) => {
        const appear = time >= introEnd ? 1 : Math.max(0, Math.min(1, (time - introStart - cell.introDelay) / 360));
        ctx.globalAlpha = 0.65 * appear;
        ctx.fillStyle = '#' + cell.shade.toString(16).repeat(3);
        const y = top + (wrapRow(row + offset) + 0.5) * rowSpacing;
        ctx.fillText(cell.glyph, x, y);
        if (slide) ctx.fillText(cell.glyph, x, y - rows * rowSpacing);
      });
    });

    ctx.globalAlpha = 1;
    for (const field of fields) {
      if (field.labelStart === null || time < field.labelStart) continue;
      const progress = reducedMotion.matches
        ? 1
        : Math.min(1, (time - field.labelStart) / highlightDuration);
      if (progress > 0) {
        ctx.globalAlpha = progress;
        ctx.font = '600 ' + font;
        drawWord(field.label, 0, field.row, '#f2f2f2');
      }
    }
    for (const field of fields) {
      if (!field.value || (field === activeField && motion.size)) continue;
      const opacity = field.highlightStart === null
        ? 1
        : Math.min(1, Math.max(0, (time - field.highlightStart) / highlightDuration));
      if (opacity > 0) {
        ctx.globalAlpha = opacity;
        ctx.font = '600 ' + font;
        drawWord(field.value, columns - field.value.length, field.row, '#f2f2f2');
      }
    }
    ctx.restore();

    function drawWord(word, firstColumn, row, color) {
      for (const [index, glyph] of Array.from(word).entries()) {
        const left = sidePadding + (firstColumn + index) * step;
        ctx.fillStyle = '#000';
        ctx.fillRect(left, top + row * rowSpacing, step, rowSpacing);
        ctx.fillStyle = color;
        ctx.fillText(glyph, left + step / 2, top + (row + 0.5) * rowSpacing);
      }
    }
  }

  function animate(time) {
    frame = null;
    if (motion.size && time >= revealEnd) {
      for (const [col, slide] of motion) {
        const cells = grid[col];
        grid[col] = cells.map((_, row) => cells[wrapRow(row - slide.shift)]);
      }
      motion.clear();
      activeField.highlightStart = time;
      unlockNextField(activeField, time);
    }
    draw(time);
    const highlighting = fields.some(field =>
      field.highlightStart !== null && time < field.highlightStart + highlightDuration);
    const labelHighlighting = !reducedMotion.matches && fields.some(field =>
      field.labelStart !== null && time < field.labelStart + highlightDuration);
    if (motion.size || highlighting || labelHighlighting) frame = requestAnimationFrame(animate);
  }

  function resize(availableWidth) {
    const nextWidth = Math.max(minWidth, Math.round(availableWidth));
    if (width === nextWidth) return;
    width = nextWidth;
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    draw(performance.now());
  }

  function reveal(field, value) {
    field.value = fitValue(value, field.label);
    updateLabel();
    motion.clear();
    activeField = field;
    field.highlightStart = null;
    const now = performance.now();
    if (!reducedMotion.matches) {
      revealEnd = now;
      for (const [index, glyph] of Array.from(field.value).entries()) {
        const col = columns - field.value.length + index;
        const cells = grid[col];
        const match = cells.findIndex((cell, row) => row !== field.row && cell.glyph === glyph);
        const source = match >= 0 ? match : wrapRow(field.row + 3 + index % 5);
        cells[source].glyph = glyph;
        const start = now + index * 65;
        const shift = field.row - source;
        const duration = 620 + Math.abs(shift) * 22;
        motion.set(col, { shift, start, duration });
        revealEnd = Math.max(revealEnd, start + duration);
      }
      if (frame === null) frame = requestAnimationFrame(animate);
    } else {
      unlockNextField(field, now);
    }
    draw(now);
  }

  resize(minWidth);
  if (introStart < introEnd) frame = requestAnimationFrame(animate);
  document.fonts.ready.then(() => { if (!disposed) draw(performance.now()); });

  return {
    canvas,
    minWidth,
    height,
    get settled() {
      const now = performance.now();
      return motion.size === 0 && (reducedMotion.matches || (
        now >= introEnd + highlightDuration &&
        fields.every(field =>
          (field.highlightStart === null || now >= field.highlightStart + highlightDuration) &&
          (field.labelStart === null || now >= field.labelStart + highlightDuration))
      ));
    },
    resize,
    finishAnimations() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const now = performance.now();
      introEnd = now - highlightDuration;
      for (const [col, slide] of motion) {
        const cells = grid[col];
        grid[col] = cells.map((_, row) => cells[wrapRow(row - slide.shift)]);
      }
      motion.clear();
      for (const field of fields) {
        field.highlightStart = null;
        if (field.labelStart !== null) field.labelStart = now - highlightDuration;
      }
      draw(now);
    },
    revealName: value => reveal(fields[0], value),
    revealFitness: value => reveal(fields[1], value),
    revealFinance: value => reveal(fields[2], value),
    revealType: value => reveal(fields[3], value),
    revealSocial: value => reveal(fields[4], value),
    revealLuck: value => reveal(fields[5], value),
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
    },
  };
}
