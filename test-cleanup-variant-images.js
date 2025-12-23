const { safeDeleteBatch } = require('./modules/upload/upload.service');

async function run() {
  // Mock public ids - these may not exist in your cloud; safeDeleteBatch wraps errors
  const publicIds = ['non-existent-id-12345', 'non-existent-id-67890'];
  const res = await safeDeleteBatch(publicIds);
  console.log('cleanup result:', res);
}

run().catch(console.error);