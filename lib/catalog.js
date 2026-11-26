const fs = require('node:fs');
const path = require('node:path');
const exercise = require('../data/lab.json');

function parseCatalog(markdown) {
  const section = markdown.match(/^##\s+(Catálogo oficial[^\r\n]*)\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m);
  if (!section) throw new Error('La consigna debe incluir una sección Catálogo oficial.');
  const rows = section[2].split(/\r?\n/).filter(line => line.trim().startsWith('|'));
  const products = rows.slice(2).map(line => {
    const cells = line.trim().split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 5 || cells.slice(0, 4).some(cell => !cell) || !/^\d+$/.test(cells[4])) {
      throw new Error('Cada fila del catálogo debe tener cuadro, estilo, tamaño, precio y stock entero.');
    }
    return [...cells.slice(0, 4), Number(cells[4])];
  });
  if (!products.length) throw new Error('El catálogo de la consigna está vacío.');
  return { products, catalogTitle: section[1] };
}

function loadLab() {
  const markdown = fs.readFileSync(path.join(__dirname, '..', 'consigna_tienda_cuadros.md'), 'utf8');
  return { ...exercise, ...parseCatalog(markdown) };
}

module.exports = { loadLab, parseCatalog };
