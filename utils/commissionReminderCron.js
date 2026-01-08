/**
 * Commission Reminder Cron Job
 * Sends reminders every 3 days for pending commissions
 * Also checks for overdue commissions and alerts admins
 */
const cron = require('node-cron');
const Commission = require('../modules/commissions/commission.model');
const User = require('../modules/users/users.model');
const notificationService = require('../modules/notifications/notification.service');
const commissionService = require('../modules/commissions/commission.service');

/**
 * Process commission reminders
 */
const processCommissionReminders = async () => {
  console.log('[CommissionCron] Starting commission reminder job...');
  
  try {
    // Get commissions needing reminders (every 3 days)
    const commissions = await commissionService.getCommissionsDueForReminder();
    
    console.log(`[CommissionCron] Found ${commissions.length} commissions needing reminders`);
    
    // Group by vendor to send consolidated notifications
    const vendorCommissions = new Map();
    
    for (const commission of commissions) {
      const vendorId = commission.vendor._id.toString();
      if (!vendorCommissions.has(vendorId)) {
        vendorCommissions.set(vendorId, {
          vendor: commission.vendor,
          commissions: [],
          totalPending: 0
        });
      }
      vendorCommissions.get(vendorId).commissions.push(commission);
      vendorCommissions.get(vendorId).totalPending += commission.commissionAmount;
    }
    
    // Send notifications to each vendor
    let sentCount = 0;
    let errorCount = 0;
    
    for (const [vendorId, data] of vendorCommissions) {
      try {
        // Send reminder for the most urgent (oldest or most overdue) commission
        const mostUrgent = data.commissions.sort((a, b) => {
          // Prioritize overdue, then by due date
          if (a.status === 'overdue' && b.status !== 'overdue') return -1;
          if (b.status === 'overdue' && a.status !== 'overdue') return 1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        })[0];
        
        await notificationService.notifyCommissionReminder(
          vendorId,
          {
            ...mostUrgent.toObject(),
            daysOverdue: mostUrgent.daysOverdue
          },
          data.totalPending
        );
        
        // Mark all commissions as reminded
        for (const commission of data.commissions) {
          await commissionService.markReminderSent(commission._id);
        }
        
        sentCount++;
      } catch (error) {
        console.error(`[CommissionCron] Error sending reminder to vendor ${vendorId}:`, error);
        errorCount++;
      }
    }
    
    console.log(`[CommissionCron] Reminders sent: ${sentCount}, Errors: ${errorCount}`);
    
    // Check for critically overdue commissions and alert admins
    await alertAdminsForOverdueCommissions();
    
  } catch (error) {
    console.error('[CommissionCron] Error in reminder job:', error);
  }
};

/**
 * Alert admins for critically overdue commissions (>7 days)
 */
const alertAdminsForOverdueCommissions = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Get critically overdue commissions
    const overdueCommissions = await Commission.aggregate([
      {
        $match: {
          status: 'overdue',
          dueDate: { $lt: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$commissionAmount' }
        }
      }
    ]);
    
    if (overdueCommissions.length > 0 && overdueCommissions[0].count > 0) {
      // Get admin users
      const admins = await User.find({ role: 'admin' }).select('_id');
      const adminIds = admins.map(a => a._id);
      
      if (adminIds.length > 0) {
        await notificationService.notifyAdminOverdueCommissions(adminIds, {
          count: overdueCommissions[0].count,
          totalAmount: overdueCommissions[0].totalAmount,
          checkDate: new Date()
        });
        
        console.log(`[CommissionCron] Alerted ${adminIds.length} admins about ${overdueCommissions[0].count} critically overdue commissions`);
      }
    }
  } catch (error) {
    console.error('[CommissionCron] Error alerting admins:', error);
  }
};

/**
 * Update overdue status for pending commissions
 */
const updateOverdueStatus = async () => {
  console.log('[CommissionCron] Updating overdue statuses...');
  
  try {
    const now = new Date();
    
    const result = await Commission.updateMany(
      {
        status: 'pending',
        dueDate: { $lt: now }
      },
      {
        $set: { status: 'overdue' },
        $push: {
          statusHistory: {
            status: 'overdue',
            changedAt: now,
            reason: 'Automatically marked overdue - past due date (cron job)'
          }
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`[CommissionCron] Marked ${result.modifiedCount} commissions as overdue`);
    }
  } catch (error) {
    console.error('[CommissionCron] Error updating overdue status:', error);
  }
};

/**
 * Start the commission reminder cron job
 * Runs every day at 9 AM
 */
const startCommissionReminderCron = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[CommissionCron] Running daily commission check...');
    
    // First update overdue statuses
    await updateOverdueStatus();
    
    // Then process reminders
    await processCommissionReminders();
  }, {
    timezone: 'Asia/Manila' // Adjust to your timezone
  });
  
  console.log('✅ Commission reminder cron job scheduled (daily at 9:00 AM)');
};

/**
 * Manual trigger for testing
 */
const runCommissionReminderManually = async () => {
  console.log('[CommissionCron] Manual trigger started...');
  await updateOverdueStatus();
  await processCommissionReminders();
  console.log('[CommissionCron] Manual trigger completed.');
};

module.exports = {
  startCommissionReminderCron,
  runCommissionReminderManually,
  processCommissionReminders,
  updateOverdueStatus
};
