const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  
  // Target audience
  targetAudience: {
    type: String,
    enum: ['all', 'users', 'vendors', 'specific'],
    default: 'all'
  },
  specificUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Announcement type
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'error', 'promotion'],
    default: 'info'
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Visibility
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Scheduling
  startDate: Date,
  endDate: Date,
  
  // Link (optional action)
  actionUrl: String,
  actionText: String,
  
  // Tracking
  viewCount: {
    type: Number,
    default: 0
  },
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // Admin who created
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
AnnouncementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
AnnouncementSchema.index({ targetAudience: 1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
