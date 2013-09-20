
var net = require('net');
var protocol = require('./sirvlog_protocol');
var util = require("util");
var events = require("events");
var os = require("os");
var _ = require('lodash');

function fallbackLogger (logObject) {
    console[logObject.level > 3 ? 'log' : 'error']( new Date(),
        Sirvlog.LEVELS[logObject.level],
        '[' + logObject.facility + ']',
        logObject.message,
        logObject.backtrace || '',
        logObject.custom || ''
    )
}

exports.Sirvlog = Sirvlog = function (options) {

    this.messageNum = 0;

    this.options = _.partialRight(_.merge, _.defaults)(options || {}, {
        fallback: fallbackLogger,
        backlogLimit: 512,
        facility: 'sirvlog'
    });

    this.hostname = os.hostname();

    this.connected = false;
    this.backlog = {};
    this.connectionAttempt = 1;
    this.init = true;

    this.connect();
};

util.inherits(Sirvlog, events.EventEmitter);

exports.createClient = function (options) {
    return new Sirvlog(options);
};


Sirvlog.prototype.connect = function () {

    var self = this;

    self.socket = net.createConnection(self.options.server.port, self.options.server.address, function () {

            self.protocol = protocol.createProtocol(self.socket).on('error', function (e) {
                self.emit('error', e);
            });

            self.connected = true;

            if (_.size(self.backlog)) { // send all queued logs

                _.each(self.backlog, function (msg, id) {
                    self.protocol.send(JSON.stringify(msg), function (messageId) {
                        delete self.backlog[messageId];
                    }.bind(self, id));
                });
            }

            if (self.init) {
                self.emit('ready'); // to listen in main app
                self.init = false;
            }

            self.connectionAttempt = 1;

        }).on('error', function (e) {

            if (e.code == 'ECONNREFUSED') {
                e.message = 'Can\'t connect to Sirvlog server at ' + self.options.server.address + ':' + self.options.server.port;
            }
            self.emit('error', e);

        }).on('close', function (had_error) {

            self.connected = false;
            if (self.connectionAttempt > 100) self.connectionAttempt = 100;
            setTimeout(self.connect.bind(self), self.init?3000:50 * self.connectionAttempt++);

        });
}

Sirvlog.LEVELS = [
    'EMERGENCY',
    'ALERT',
    'CRITICAL',
    'ERROR',
    'WARNING',
    'NOTICE',
    'INFO',
    'DEBUG'
]

_.each(Sirvlog.LEVELS, function (level, ind) {
    Sirvlog['LEVEL_' + level] = ind;
})

Sirvlog.prototype._store = function(logObj){

    var self = this;

    if(!logObj.hostname){
        logObj.hostname = self.hostname;
    }

    if(!logObj.level){
        logObj.level = Sirvlog.LEVEL_INFO;
    }

    if(!logObj.facility){
        logObj.facility = self.facility;
    }

    logObj.order = self.messageNum++;

    if (self.options.backlogLimit) {
        if (_.size(self.backlog) > self.options.backlogLimit) {
            var msgId = _.keys(self.backlog)[0];
            self.options.fallback(self.backlog[msgId])
            delete self.backlog[msgId];
        }
        self.backlog[logObj.order] = logObj; // put message to backlog
    }

    if (!self.connected) {
        if (!self.options.backlogLimit) {
            self.options.fallback(logObj)
        }
        return;
    }

    self.protocol.send(JSON.stringify(logObj), function () {
        if(self.backlog[logObj.order]){
            delete self.backlog[logObj.order];
        }
    });
}

Sirvlog.prototype._log = function (level, message, backtrace, file, line, custom) {

    if (level < Sirvlog.LEVEL_EMERGENCY || level > Sirvlog.LEVEL_DEBUG) level = Sirvlog.LEVEL_INFO;

    if (typeof message !== 'string' || message == '') return;

    var logObj = {
        hostname: this.hostname,
        timestamp: Date.now(),
        facility: this.facility,
        level: level,
        message: message
    }

    if (typeof custom === 'object') {
        logObj.custom = custom;
    }

    if (typeof line === 'number') {
        logObj.line = line;
    } else if (typeof line === 'object') {
        logObj.custom = line;
    }

    if (typeof file === 'string' && file != '') {
        logObj.file = file;
    } else if (typeof file === 'object') {
        logObj.custom = file;
    }

    if (typeof backtrace === 'string' && backtrace != '') {
        logObj.backtrace = backtrace;
    } else if (typeof backtrace === 'object') {
        logObj.custom = backtrace;
    }

    this._store(logObj);

}

Sirvlog.prototype.log = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_INFO, message, backtrace, file, line, custom);
}

Sirvlog.prototype.emergency = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_EMERGENCY, message, backtrace, file, line, custom);
}

Sirvlog.prototype.alert = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_ALERT, message, backtrace, file, line, custom);
}

Sirvlog.prototype.critical = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_CRITICAL, message, backtrace, file, line, custom);
}

Sirvlog.prototype.error = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_ERROR, message, backtrace, file, line, custom);
}

Sirvlog.prototype.warning = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_WARNING, message, backtrace, file, line, custom);
}

Sirvlog.prototype.notice = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_NOTICE, message, backtrace, file, line, custom);
}

Sirvlog.prototype.info = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_INFO, message, backtrace, file, line, custom);
}

Sirvlog.prototype.debug = function (message, backtrace, file, line, custom) {
    this._log(Sirvlog.LEVEL_DEBUG, message, backtrace, file, line, custom);
}




