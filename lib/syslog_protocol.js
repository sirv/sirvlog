// oleksiy krivoshey

var net = require('net');
var events = require("events");
var util = require("util");
var _ = require('underscore');

exports.SyslogProtocol = SyslogProtocol = function (socket) {

    socket.setEncoding('utf8');

    events.EventEmitter.call(this);

    this.socket = socket;

    this._tempBuf = null;

    this.socket.setNoDelay(); // increases speed

    this.socket.on('data', this.receive.bind(this));
};

util.inherits(SyslogProtocol, events.EventEmitter);

SyslogProtocol.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

SyslogProtocol.facilities = [
    'kernel',
    'user',
    'mail',
    'daemon',
    'auth',
    'syslog',
    'printer',
    'news',
    'uucp',
    'clock',
    'auth',
    'ftp',
    'ntp',
    'audit',
    'alert',
    'clock',
    'local0',
    'local1',
    'local2',
    'local3',
    'local4',
    'local5',
    'local6',
    'local7'
];


SyslogProtocol.prototype.processSyslogMessage = function (data) {
    if (data.length == 0) {
        return;
    }

    var matches = data.match(/^<(\d+)>(.{15})\s(\S+)?\s(.+?):(.+)$/);

    if(matches){
        var nFacility = matches[1]>>3;

        var dateMatches = matches[2].match(/^(.{3})\s+(\d+)\s(\d{2}):(\d{2}):(\d{2})$/);
        var facilityMatches = matches[4].match(/^(.+)\[(\d+)\]$/);
        var date = new Date();
        var subFacility = matches[4];

        if(dateMatches){
            date.setMonth(SyslogProtocol.months.indexOf(dateMatches[1]));
            date.setDate(dateMatches[2]);
            date.setHours(dateMatches[3]);
            date.setMinutes(dateMatches[4]);
            date.setSeconds(dateMatches[5]);
        }

        if(facilityMatches){
            subFacility = facilityMatches[1];
        }

        var msg = {
            hostname: matches[3]?matches[3]:this.socket.remoteAddress,
            timestamp: date.getTime(),
            facility: SyslogProtocol.facilities[nFacility] + '/' + subFacility,
            level: matches[1] - (nFacility<<3),
            message: matches[5].trim()
        }

        if(facilityMatches){
            msg['custom'] = {
                pid: facilityMatches[2]
            }
        }

        this.emit('receive', msg);

    } else {
        console.warn('Failed to parse syslog message: ', data);

        var msg = {
            hostname: this.socket.remoteAddress,
            timestamp: Date.now(),
            facility: 'syslog',
            level: 6,
            message: data
        }

        this.emit('receive', msg);
    }
};

SyslogProtocol.prototype.receive = function (buf) {
    _.each(buf.split('\n'), this.processSyslogMessage.bind(this));
}

exports.createProtocol = function (socket) {
    return new SyslogProtocol(socket);
};

