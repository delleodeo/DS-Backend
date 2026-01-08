/**
 * Notification Service
 * Handles notification creation, delivery, and management
 */
const Notification = require('./notification.model');
const { getIO } = require('../../config/socket');
const { getAsync, setAsync, delAsync } = require('../../config/redis');
const mongoose = require('mongoose');

/**
 * Validate ObjectId
 */
const isValidObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * Create a notification
 */
const createNotification = async (data) => {
  try {
    const {
      userId,
      type,
      title,
      message,
      priority = 'medium',
      referenceType = null,
      referenceId = null,
      actionUrl = null,
      metadata = {}
    } = data;
    
    if (!isValidObjectId(userId)) {
      throw new Error('Invalid user ID');
    }
    
    const notification = new Notification({
      user: userId,
      type,
      title: title.substring(0, 200),
      message: message.substring(0, 1000),
      priority,
      referenceType,
      referenceId,
      actionUrl,
      metadata
    });
    
    await notification.save();
    
    // Invalidate cache
    await delAsync(`notifications:unread:${userId}`);
    
    // Send real-time notification via Socket.IO
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('notification', {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt
        });
      }
    } catch (socketError) {
      console.error('[Notification] Socket emit error:', socketError);
    }
    
    return notification;
  } catch (error) {
    console.error('[Notification] Error creating notification:', error);
    throw error;
  }
};

/**
 * Create commission pending notification
 */
const notifyCommissionPending = async (vendorId, commission) => {
  return createNotification({
    userId: vendorId,
    type: 'commission_pending',
    title: 'New Commission Pending',
    message: `You have a pending commission of ₱${commission.commissionAmount.toFixed(2)} for Order #${commission.metadata?.orderNumber || 'N/A'}. Please remit before ${new Date(commission.dueDate).toLocaleDateString()}.`,
    priority: 'medium',
    referenceType: 'commission',
    referenceId: commission._id,
    actionUrl: '/vendor/commissions',
    metadata: {
      commissionAmount: commission.commissionAmount,
      orderNumber: commission.metadata?.orderNumber,
      dueDate: commission.dueDate
    }
  });
};

/**
 * Create commission reminder notification (every 3 days)
 */
const notifyCommissionReminder = async (vendorId, commission, totalPending) => {
  const daysOverdue = commission.daysOverdue || 0;
  const isOverdue = daysOverdue > 0;
  
  return createNotification({
    userId: vendorId,
    type: isOverdue ? 'commission_overdue' : 'commission_reminder',
    title: isOverdue ? '⚠️ Commission Overdue' : '🔔 Commission Reminder',
    message: isOverdue 
      ? `Your commission of ₱${commission.commissionAmount.toFixed(2)} is ${daysOverdue} days overdue. Total pending: ₱${totalPending.toFixed(2)}. Please remit immediately to avoid penalties.`
      : `Reminder: You have a pending commission of ₱${commission.commissionAmount.toFixed(2)}. Due date: ${new Date(commission.dueDate).toLocaleDateString()}. Total pending: ₱${totalPending.toFixed(2)}.`,
    priority: isOverdue ? 'urgent' : 'high',
    referenceType: 'commission',
    referenceId: commission._id,
    actionUrl: '/vendor/commissions',
    metadata: {
      commissionAmount: commission.commissionAmount,
      totalPending,
      daysOverdue,
      dueDate: commission.dueDate
    }
  });
};

/**
 * Create commission remitted notification
 */
const notifyCommissionRemitted = async (vendorId, commission, newBalance) => {
  return createNotification({
    userId: vendorId,
    type: 'commission_remitted',
    title: '✅ Commission Remitted',
    message: `Successfully remitted ₱${commission.commissionAmount.toFixed(2)} for Order #${commission.metadata?.orderNumber || 'N/A'}. New wallet balance: ₱${newBalance.toFixed(2)}.`,
    priority: 'low',
    referenceType: 'commission',
    referenceId: commission._id,
    actionUrl: '/vendor/wallet',
    metadata: {
      commissionAmount: commission.commissionAmount,
      orderNumber: commission.metadata?.orderNumber,
      newBalance
    }
  });
};

/**
 * Create admin notification for overdue commissions
 */
const notifyAdminOverdueCommissions = async (adminIds, overdueData) => {
  const notifications = adminIds.map(adminId => ({
    user: adminId,
    type: 'admin_alert',
    title: '⚠️ Overdue Commissions Alert',
    message: `There are ${overdueData.count} overdue commissions totaling ₱${overdueData.totalAmount.toFixed(2)} requiring attention.`,
    priority: 'high',
    referenceType: 'commission',
    actionUrl: '/admin/commissions',
    metadata: overdueData
  }));
  
  return Notification.bulkCreate(notifications);
};

/**
 * Get notifications for user with caching
 */
const getNotifications = async (userId, options = {}) => {
  try {
    if (!isValidObjectId(userId)) {
      throw new Error('Invalid user ID');
    }
    
    return Notification.getForUser(userId, options);
  } catch (error) {
    console.error('[Notification] Error getting notifications:', error);
    throw error;
  }
};

/**
 * Get unread count with caching
 */
const getUnreadCount = async (userId) => {
  try {
    const cacheKey = `notifications:unread:${userId}`;
    
    const cached = await getAsync(cacheKey);
    if (cached !== null) {
      return parseInt(cached);
    }
    
    const count = await Notification.getUnreadCount(userId);
    
    // Cache for 5 minutes
    await setAsync(cacheKey, count.toString(), 'EX', 300);
    
    return count;
  } catch (error) {
    console.error('[Notification] Error getting unread count:', error);
    return 0;
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { $set: { isRead: true } },
      { new: true }
    );
    
    if (notification) {
      await delAsync(`notifications:unread:${userId}`);
    }
    
    return notification;
  } catch (error) {
    console.error('[Notification] Error marking as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (userId) => {
  try {
    const result = await Notification.markAllAsRead(userId);
    await delAsync(`notifications:unread:${userId}`);
    return result;
  } catch (error) {
    console.error('[Notification] Error marking all as read:', error);
    throw error;
  }
};

/**
 * Delete notification
 */
const deleteNotification = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId
    });
    
    if (notification) {
      await delAsync(`notifications:unread:${userId}`);
    }
    
    return notification;
  } catch (error) {
    console.error('[Notification] Error deleting notification:', error);
    throw error;
  }
};

/**
 * Delete all read notifications for user
 */
const deleteReadNotifications = async (userId) => {
  try {
    return Notification.deleteMany({
      user: userId,
      isRead: true
    });
  } catch (error) {
    console.error('[Notification] Error deleting read notifications:', error);
    throw error;
  }
};

/**
 * Send bulk notifications to vendors (for cron job)
 */
const sendBulkCommissionReminders = async (commissionsWithVendors) => {
  const results = {
    sent: 0,
    failed: 0,
    errors: []
  };
  
  for (const item of commissionsWithVendors) {
    try {
      await notifyCommissionReminder(
        item.vendor._id,
        item,
        item.totalPending || item.commissionAmount
      );
      results.sent++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        vendorId: item.vendor._id,
        error: error.message
      });
    }
  }
  
  return results;
};

module.exports = {
  createNotification,
  notifyCommissionPending,
  notifyCommissionReminder,
  notifyCommissionRemitted,
  notifyAdminOverdueCommissions,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
  sendBulkCommissionReminders
};
