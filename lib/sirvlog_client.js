
var net = require('net');
var protocol = require('./sirvlog_protocol');
var util = require("util");
var events = require("events");
var os = require("os");
var _ = require('underscore');

exports.Sirvlog = Sirvlog = function (options) {

    this.messageNum = 0;

    this.options = options;

    if (this.options.backlogLimit === undefined) this.options.backlogLimit = 512;
    this.facility = (typeof options.facility === 'string' && options.facility) ? options.facility : 'sirvlog';

    this.hostname = os.hostname();

    this.connected = false;
    this.backlog = {};
    this.connectionAttempt = 1;
    this.init = true;

    //this.messageID = 0;

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

            //console.log('connected to server');

            if (_.size(self.backlog)) { // send all queued logs
                //console.log('send all queued logs, num=', _.size(self.backlog));

                _.each(self.backlog, function (msg, id) {
                    self.protocol.send(JSON.stringify(msg), function (messageId) {
                        //console.log('message ', messageId, ' was sent');
                        delete self.backlog[messageId];
                    }.bind(this, id));
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
            setTimeout(self.connect.bind(this), self.init?3000:50 * self.connectionAttempt++);

        });
}


Sirvlog.LEVEL_EMERGENCY = 0;
Sirvlog.LEVEL_ALERT = 1;
Sirvlog.LEVEL_CRITICAL = 2;
Sirvlog.LEVEL_ERROR = 3;
Sirvlog.LEVEL_WARNING = 4;
Sirvlog.LEVEL_NOTICE = 5;
Sirvlog.LEVEL_INFO = 6;
Sirvlog.LEVEL_DEBUG = 7;

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
            var logObj1 = self.backlog[msgId];
            console[logObj1.level > 3 ? 'log' : 'error'](new Date(), logObj1); // log this message and drop it from buffer
            delete self.backlog[msgId];
        }
        self.backlog[logObj.order] = logObj; // put message to backlog
    }

    if (!self.connected) {
        if (!self.options.backlogLimit) {
            console[logObj.level > 3 ? 'log' : 'error'](new Date(), logObj); // log this message
        }
        return;
    }

    //console.log(self.backlog);

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
        //timestamp: Date.now(),
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




