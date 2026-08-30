import { copyFile, mkdir, rm } from 'node:fs/promises';

const outputRoot = 'public/ocr';
await rm(outputRoot, { recursive: true, force: true });
await mkdir(`${outputRoot}/core`, { recursive: true });
await mkdir(`${outputRoot}/lang`, { recursive: true });

await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${outputRoot}/worker.min.js`);
await copyFile(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  `${outputRoot}/lang/eng.traineddata.gz`
);

for (const base of [
  'tesseract-core-lstm',
  'tesseract-core-simd-lstm',
  'tesseract-core-relaxedsimd-lstm'
]) {
  await copyFile(`node_modules/tesseract.js-core/${base}.wasm.js`, `${outputRoot}/core/${base}.wasm.js`);
  await copyFile(`node_modules/tesseract.js-core/${base}.wasm`, `${outputRoot}/core/${base}.wasm`);
}
