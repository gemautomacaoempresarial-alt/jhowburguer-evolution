let io = null;
const userSockets = new Map();

function setIo(instance) {
  io = instance;
}

function emit(event, payload) {
  if (io) io.emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (io && Number(userId)) io.to(`user:${Number(userId)}`).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!io || !ids.length) return;
  for (const id of ids) io.to(`user:${id}`).emit(event, payload);
}

function emitToRole(role, event, payload) {
  if (io && role) io.to(`role:${String(role)}`).emit(event, payload);
}

function registerUserSocket(userId, socketId) {
  const id = Number(userId);
  if (!id || !socketId) return false;
  const sockets = userSockets.get(id) || new Set();
  const wasOffline = sockets.size === 0;
  sockets.add(socketId);
  userSockets.set(id, sockets);
  return wasOffline;
}

function unregisterUserSocket(userId, socketId) {
  const id = Number(userId);
  const sockets = userSockets.get(id);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size > 0) return false;
  userSockets.delete(id);
  return true;
}

function isUserOnline(userId) {
  return (userSockets.get(Number(userId))?.size || 0) > 0;
}

module.exports = {
  setIo,
  emit,
  emitToUser,
  emitToUsers,
  emitToRole,
  registerUserSocket,
  unregisterUserSocket,
  isUserOnline,
};
