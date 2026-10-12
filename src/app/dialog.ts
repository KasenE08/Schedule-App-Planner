/** A small choice dialog (native confirm only offers two buttons). Resolves with the chosen index, or -1. */
export function choose(message: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog';
    const p = document.createElement('p');
    p.textContent = message;
    box.append(p);
    const done = (i: number) => {
      backdrop.remove();
      resolve(i);
    };
    options.forEach((label, i) => {
      const b = document.createElement('button');
      b.className = `btn wide ${i === 0 ? 'primary' : ''}`;
      b.textContent = label;
      b.onclick = () => done(i);
      box.append(b);
    });
    backdrop.onclick = (e) => e.target === backdrop && done(-1);
    backdrop.append(box);
    document.body.append(backdrop);
  });
}
