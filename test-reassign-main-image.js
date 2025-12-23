const { reassignMainImageIfNeeded } = require('./modules/products/products.service');

function run() {
  const product = {
    imageUrls: ['a.jpg','b.jpg'],
    option: []
  };
  const res = reassignMainImageIfNeeded(product, 'b.jpg');
  console.log('reassign result:', res, 'new images:', product.imageUrls);
}

run();