// oleksiy krivoshey

var net = require('net');
var protocol = require('./sirvlog_protocol');
var util = require("util");
var events = require("events");
var os = require("os");
var _ = require('underscore');

exports.Sirvlog = Sirvlog = function (options) {

    this.options = options;

    if (this.options.backlogLimit === undefined) this.options.backlogLimit = 512;
    this.facility = (typeof options.facility === 'string' && options.facility) ? options.facility : 'sirvlog';

    this.hostname = os.hostname();

    this.connected = false;
    this.backlog = {};
    this.connectionAttempt = 1;
    this.init = true;

    this.messageID = 0;

    this.connect();
};

util.inherits(Sirvlog, events.EventEmitter);

exports.createClient = function (options) {
    return new Sirvlog(options);
};


Sirvlog.prototype.connect = function () {

    this.socket = net.createConnection(this.options.server.port, this.options.server.address, function () {

            this.protocol = protocol.createProtocol(this.socket).on('error', function (e) {
                console.error(e);
            }.bind(this));

            this.connected = true;

            //console.log('connected to server');

            if (_.size(this.backlog)) { // send all queued logs
                //console.log('send all queued logs, num=', _.size(this.backlog));

                _.each(this.backlog, function (msg, id) {
                    this.protocol.send(JSON.stringify(msg), function (messageId) {
                        //console.log('message ', messageId, ' was sent');
                        delete this.backlog[messageId];
                    }.bind(this, id));
                }.bind(this));
            }

            if (this.init) {
                this.emit('ready'); // to listen in main app
                this.init = false;
            }

            this.connectionAttempt = 1;

        }.bind(this)).on('error', function (e) {

            if (e.code == 'ECONNREFUSED') {
                e.message = 'Can\'t connect to Sirvlog server at ' + this.options.server.address + ':' + this.options.server.port;
            }
            this.emit('error', e);

        }.bind(this)).on('close', function (had_error) {

            this.connected = false;
            if (this.connectionAttempt > 100) this.connectionAttempt = 100;
            setTimeout(this.connect.bind(this), this.init?3000:50 * this.connectionAttempt++);

        }.bind(this));
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
    if(!logObj.hostname){
        logObj.hostname = this.hostname;
    }

    if(!logObj.level){
        logObj.level = Sirvlog.LEVEL_INFO;
    }

    if(!logObj.facility){
        logObj.facility = this.facility;
    }

    if (this.options.backlogLimit) {
        if (_.size(this.backlog) > this.options.backlogLimit) {
            var msgId = _.keys(this.backlog)[0];
            var logObj1 = this.backlog[msgId];
            console.log(new Date(), logObj1); // log this message and drop it from buffer
            delete this.backlog[msgId];
        }
        this.backlog[this.messageID++] = logObj; // put message to backlog
    }

    if (!this.connected) {
        if (!this.options.backlogLimit) {
            console.log(new Date(), logObj); // log this message
        }
        return;
    }

    //console.log(this.backlog);

    this.protocol.send(JSON.stringify(logObj), function (messageId) {
        if(messageId > 0){
            //console.log('message ', messageId, ' was sent');
            delete this.backlog[messageId];
        }
    }.bind(this, this.messageID - 1));
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




