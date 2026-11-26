const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCatalog } = require('../lib/catalog');

test('lee los cambios de la tabla Markdown sin depender de productos duplicados', () => {
  const markdown = '# Consigna\n\n## Catálogo oficial\n\n| Cuadro | Estilo | Tamaño | Precio | Stock |\n| --- | --- | --- | --- | --- |\n| Bruma de otoño | Abstracto, tierra y beige | 40 × 50 cm | $65.000 | 3 |\n\n## Entrega\nTexto';
  assert.deepEqual(parseCatalog(markdown).products, [['Bruma de otoño', 'Abstracto, tierra y beige', '40 × 50 cm', '$65.000', 3]]);
  assert.equal(parseCatalog(markdown).catalogTitle, 'Catálogo oficial');
  assert.equal(parseCatalog(markdown.replace('$65.000', '$75.000')).products[0][3], '$75.000');
  assert.throws(() => parseCatalog(markdown.replace('| 3 |', '| incorrecto |')));
  assert.throws(() => parseCatalog('# Sin catálogo'));
});
