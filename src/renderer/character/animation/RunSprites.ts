/** Remove only corner-colored pixels connected to the image border; preserve enclosed whites. */
export function prepareRunSprite(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels;
  const background = [data[0]!, data[1]!, data[2]!];
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const add = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    const i = p * 4;
    if (data[i + 3]! < 10 || background.every((c, k) => Math.abs(data[i + k]! - c) <= 10)) queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++]!, x = p % width, y = Math.floor(p / width);
    data[p * 4 + 3] = 0;
    if (x > 0) add(p - 1); if (x + 1 < width) add(p + 1);
    if (y > 0) add(p - width); if (y + 1 < height) add(p + width);
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
