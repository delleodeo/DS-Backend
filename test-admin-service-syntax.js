// Simple syntax check for adminDashboard.service.js
try {
  require('./modules/admin/services/adminDashboard.service.js');
  console.log('✅ Syntax check passed!');
  process.exit(0);
} catch (error) {
  console.error('❌ Syntax error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
