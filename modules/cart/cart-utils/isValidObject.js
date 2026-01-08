/**
 * Validate ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean}
 */
function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}