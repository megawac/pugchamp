/* jshint node: true, esversion: 6, eqeqeq: true, latedef: true, undef: true, unused: true */
"use strict";

const co = require('co');
const lodash = require('lodash');

module.exports = function(app, database, io, self, server) {
    var onlineUsers = new Map();

    self.getOnlineUserList = function() {
        return lodash([...onlineUsers.values()]).filter(user => user.setUp).map(user => lodash.pick(user.toObject(), 'id', 'alias', 'steamID', 'admin')).sortBy('alias').value();
    };

    self.sendMessage = co.wrap(function* sendMessage(message) {
        if (onlineUsers.has(message.user)) {
            message.user = onlineUsers.get(message.user);
        }
        else {
            message.user = yield database.User.findById(message.user);
        }

        message.user = lodash.pick(message.user.toObject(), 'id', 'alias', 'steamID', 'admin');

        io.sockets.emit('messageReceived', message);
    });

    self.on('userConnected', function(userID) {
        co(function*() {
            if (!onlineUsers.has(userID)) {
                onlineUsers.set(userID, yield database.User.findById(userID));
            }

            let user = onlineUsers.get(userID);

            if (user.setUp) {
                self.sendMessage({
                    user: userID,
                    action: 'connected'
                });
            }

            io.sockets.emit('onlineUserListUpdated', self.getOnlineUserList());
        });
    });

    self.on('userDisconnected', function(userID) {
        co(function*() {
            if (!onlineUsers.has(userID)) {
                onlineUsers.set(userID, yield database.User.findById(userID));
            }

            let user = onlineUsers.get(userID);

            if (user.setUp) {
                self.sendMessage({
                    user: userID,
                    action: 'disconnected'
                });
            }

            onlineUsers.delete(userID);

            io.sockets.emit('onlineUserListUpdated', self.getOnlineUserList());
        });
    });

    io.sockets.on('connection', function(socket) {
        socket.emit('onlineUserListUpdated', self.getOnlineUserList());
    });

    io.sockets.on('authenticated', function(socket) {
        socket.on('sendChatMessage', function(chat) {
            let userRestrictions = self.getUserRestrictions(socket.decoded_token);

            if (!lodash.includes(userRestrictions.aspects, 'chat')) {
                let trimmedMessage = lodash.trim(chat.message);

                if (trimmedMessage.length > 0) {
                    self.sendMessage({
                        user: socket.decoded_token,
                        body: trimmedMessage
                    });
                }
            }
        });
    });
};
