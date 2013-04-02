// oleksiy krivoshey

var net = require('net');
var events = require("events");
var util = require("util");
var LZ77 = require('./lz77');
var zlib = require('zlib');

exports.SirvlogProtocol = SirvlogProtocol = function (socket) {
    events.EventEmitter.call(this);

    this.socket = socket;

    this._tempBuf = null;
    //this._writeBuf = new Buffer(512); //512 bytes - initial size

    this.socket.setNoDelay(); // increases speed

    this.socket.on('data', this.receive.bind(this));
};

util.inherits(SirvlogProtocol, events.EventEmitter);

SirvlogProtocol.ENCODING_PLAIN = 0x01;
SirvlogProtocol.ENCODING_LZ77 = 0x02;
SirvlogProtocol.ENCODING_DEFLATE = 0x03;


SirvlogProtocol.prototype._send = function (encoding, message, callback) {

    if (!Buffer.isBuffer(message)) {
        message = new Buffer(message);
    }

    var dataLen = message.length;

    //if (this._writeBuf.length < dataLen) this._writeBuf = new Buffer(dataLen + 3);
    //var buf = this._writeBuf.slice(0, dataLen + 3);
    var buf = new Buffer(dataLen + 3);

    buf[0] = encoding & 0xff;

    buf[1] = (dataLen >> 8) & 0xff;
    buf[2] = dataLen & 0xff;

    message.copy(buf, 3);

    try {
        this.socket.write(buf, callback);
    } catch (e) {
        this.emit('error', e);
    }
}

SirvlogProtocol.prototype.send = function (message, callback) {

    var dataLen = message.length;

    if (dataLen > 65535) {
        this.emit('error', new Error('Message is too long'))
        return;
    }

    if (dataLen < 512) {
        this._send(SirvlogProtocol.ENCODING_PLAIN, message, callback);

    } /* else if(dataLen < 1000) {
     this._send(SirvlogProtocol.ENCODING_LZ77, LZ77.compress(message, 1000), callback);
     } */ else {
        zlib.deflate(message, function (err, buffer) {
            if (err) {
                this._send(SirvlogProtocol.ENCODING_PLAIN, message, callback);
            } else {
                this._send(SirvlogProtocol.ENCODING_DEFLATE, buffer, callback);
            }
        }.bind(this));
    }

}

SirvlogProtocol.prototype.receive = function (buf) {

    var _buf = buf;

    if (this._tempBuf) {
        if (this._tempBuf.length > 64 * 1024) {
            this._tempBuf = null;
            return;
        }
        _buf = new Buffer(this._tempBuf.length + buf.length);
        this._tempBuf.copy(_buf);
        buf.copy(_buf, this._tempBuf.length);
    }

    if (_buf.length < 3) {
        this._tempBuf = _buf;
        return;
    }

    var header = {
        encoding: _buf[0],
        length: (_buf[1] << 8) + _buf[2]
    };

    if (header.length > 65535) {
        this._tempBuf = null;
        this.emit('error', new Error('Message is too long'));
        return;
    }

    if (header.encoding > SirvlogProtocol.ENCODING_DEFLATE) {
        this._tempBuf = null;
        this.emit('error', new Error('Incorrect message header received (encoding field)'));
        return;
    }

    //console.log(header);

    if (_buf.length < 3 + header.length) {
        this._tempBuf = _buf;
        return;
    } else {
        this._tempBuf = null;
    }

    if(header.length <= 0){
        return;
    }

    var data = _buf.slice(3, header.length + 3);

    if (header.encoding == SirvlogProtocol.ENCODING_PLAIN) {
        try {
            this.emit('receive', JSON.parse(data.toString('utf8')));
        } catch (e) {
            this.emit('error', 'JSON.parse failed: ' + e);
        }

    } else if (header.encoding == SirvlogProtocol.ENCODING_LZ77) {
        try {
            this.emit('receive', JSON.parse(LZ77.decompress(data.toString('utf8'))));
        } catch (e) {
            this.emit('error', 'JSON.parse failed: ' + e);
        }

    } else if (header.encoding == SirvlogProtocol.ENCODING_DEFLATE) {

        zlib.inflate(data, function (err, buffer) {
            if (!err) {
                try {
                    this.emit('receive', JSON.parse(buffer.toString('utf8')));
                } catch (e) {
                    this.emit('error', 'JSON.parse failed: ' + e);
                }
            } else {
                this.emit('error', new Error('zlib.inflate failed: ' + err));
            }
        }.bind(this));
    }

    if (_buf.length > 3 + header.length) {
        this.receive(_buf.slice(header.length + 3));
    }
}

exports.createProtocol = function (socket) {
    return new SirvlogProtocol(socket);
};

