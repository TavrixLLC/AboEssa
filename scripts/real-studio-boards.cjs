const fs = require('node:fs'),
  path = require('node:path'),
  sharp = require('sharp');
const m = JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json', 'utf8'));
(async () => {
  const dir = path.join(m.dir, 'visual-review-' + Date.now());
  fs.mkdirSync(dir);
  for (let start = 0; start < m.photos.length; start += 6) {
    const rows = m.photos.slice(start, start + 6),
      h = rows.length * 300,
      panels = [];
    const labels = [];
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i],
        record = JSON.parse(fs.readFileSync(path.join(m.dir, 'admit-' + p.tag + '.json'), 'utf8'));
      const original = await sharp(p.original)
        .resize(300, 265, { fit: 'contain', background: '#303030' })
        .png()
        .toBuffer();
      panels.push({ input: original, left: 0, top: i * 300 + 30 });
      const guided = path.join(m.dir, 'media', p.tag + '-guided-candidate.webp'),
        automatic = path.join(m.dir, 'media', p.tag + '-auto-candidate.webp');
      const result =
        process.argv[2] === 'guided' && fs.existsSync(guided)
          ? guided
          : fs.existsSync(automatic)
            ? automatic
            : null;
      if (result)
        panels.push({
          input: await sharp(result)
            .resize(300, 265, { fit: 'contain', background: '#dddddd' })
            .png()
            .toBuffer(),
          left: 310,
          top: i * 300 + 30,
        });
      labels.push(
        `<text x="5" y="${i * 300 + 22}" font-size="17" fill="#E7BC61">${p.tag} ORIGINAL | ${result?.includes('guided') ? 'GUIDED' : record.automatic.status === 'COMPLETED' ? 'AUTOMATIC' : 'FAILED - ORIGINAL KEPT'} / NOT APPROVED</text>`,
      );
    }
    const bg = Buffer.from(
      `<svg width="610" height="${h}"><rect width="610" height="${h}" fill="#161919"/>${labels.join('')}</svg>`,
    );
    fs.writeFileSync(
      path.join(dir, 'sheet-' + (start / 6 + 1) + '.png'),
      await sharp(bg).composite(panels).png().toBuffer(),
      { flag: 'wx' },
    );
  }
  console.log(
    JSON.stringify({
      directory: dir,
      originals: 17,
      method: 'Actual HTTP candidate previews, NOT fal output',
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
