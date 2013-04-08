// oleksiy krivoshey

var net = require('net');
var sirvlogProtocol = require('./sirvlog_protocol');
var syslogProtocol = require('./syslog_protocol');
//var util = require("util");
var async = require("async");
var _ = require('underscore');
var crypto = require('crypto');
var path = require('path');
var persistentObject = require('./persistent_object');
var elastical = require('elastical');
var fs = require('fs');

exports.SirvlogServer = SirvlogServer = function (opts) {

    this.options = opts;
    this.servers = {};

    this.indexName = this.getIndexName();

    this.bulkOperationPending = false;

    this.messages = new persistentObject(path.resolve(this.options.runtimeDir, '.sirvlog.queue'), {
        queue: []
    });

    this.elasticClient = new elastical.Client(this.options.elasticsearch.hostname, this.options.elasticsearch.options);

    this.rotateIndex();

    // check if we need to create new index
    setInterval(this.rotateIndex.bind(this), 60*1000);

    // send bulk operation once per second
    setInterval(this.bulkIndex.bind(this), 1000);

    var shutdownFunc = function () {
        console.log("Gracefully shutting down service")
        process.removeListener('SIGINT', shutdownFunc);
        process.removeListener('SIGTERM', shutdownFunc);

        async.parallel(
            _.map(this.servers, function(server, name){
                return function(cb){
                    server.close(cb.bind(cb, null, name));
                }
            })
        , function(err, names){
            console.log('all connections closed (' + names + '), exiting');
            process.exit()
        });

    }.bind(this);

    process.setMaxListeners(0);

    process.on('SIGINT', shutdownFunc);
    process.on('SIGTERM', shutdownFunc);

    this.startTCPServer('sirvlog', sirvlogProtocol, this.options.network.port.sirvlog);

    this.startTCPServer('syslog', syslogProtocol, this.options.network.port.syslog);
}

// starts sirvlog protocol server
SirvlogServer.prototype.startTCPServer = function (name, protocol, port) {

    var logPrefix = '['+name+'] ';

    this.servers[name] = net.createServer(function (sc) { //'connection' listener

        var shutdownFunc = function (socket) {
            socket.end();
            setTimeout(function (socket) {
                if(socket.destroyed) {
                    return;
                }
                console.error(logPrefix + 'Failed to close connection with ' + socket.remoteAddress + ':' + socket.remotePort + ' in 3 secs, doing force-close');
                socket.destroy();
            }.bind(this, socket), 3000);
        }.bind(this, sc);

        process.on('SIGINT', shutdownFunc);
        process.on('SIGTERM', shutdownFunc);

        var connectionErrors = 0;

        console.log(logPrefix + 'Incoming connection from ' + sc.remoteAddress);

        sc.on('end', function () {
            console.log(logPrefix + 'Connection closed');
            process.removeListener('SIGINT', shutdownFunc);
            process.removeListener('SIGTERM', shutdownFunc);
        }.bind(this));

        var filterCtx = {
            remoteAddress: sc.remoteAddress,
            remotePort: sc.remotePort
        }

        protocol.createProtocol(sc).
            on('receive', function (message) { // log message received

                this.processMessage(message, filterCtx);

            }.bind(this)).
            on('error', function (e) { // parse or processing error from protocol
                console.error(e);
                if (connectionErrors++ >= 5) {
                    console.warn(logPrefix + 'Too many errors from ' + sc.remoteAddress + ', closing connection');
                    sc.destroy();
                }
            }.bind(this));

    }.bind(this));

    this.servers[name].listen(port, this.options.network.bind, function () { //'listening' listener

        console.log(logPrefix + 'Listening on ', this.servers[name].address());
    }.bind(this));

};

SirvlogServer.prototype.processMessage = function(messageObj, filterCtx){

    if (this.options.messageTTL) { // set ttl (ms)
        messageObj._ttl = this.options.messageTTL;
    }

    messageObj.receivedTs = Date.now();

    // TODO: find a faster alternative!!!
    var id = crypto.createHash('md5').update(messageObj.receivedTs + JSON.stringify(messageObj) + Math.random()).digest("hex");

    // replace 'custom' field with facility-dependant
    var customName = messageObj.facility.replace(/(\W|\s)/g, '-').replace(/-+/g, '-').toLowerCase();
    messageObj[customName] = messageObj.custom;
    delete messageObj.custom;

    // run through filters
    for (var i = 0; i < this.options.filters.length; i++) {
        var stop = this.options.filters[i].apply(messageObj, [filterCtx]);

        if (stop === null) { // message dropped by filter
            //console.log('message dropped by filter');
            return;
        } else if (stop === false) { // stop filter processing
            //console.log('stop processing by filters');
            break;
        }
    }

    this.messages.queue.push({
        create: {
            index: this.indexName,
            id: id,
            version: 1,
            version_type: 'external',
            type: 'message',
            data: messageObj
        }
    });
};

SirvlogServer.prototype.bulkIndex = function (facility) {

    if(this.bulkOperationPending || !this.indexName){
        return;
    }

    this.bulkOperationPending = true;

    var count = this.messages.queue.length;

    if(count){
        var msgs = this.messages.queue;

        if(count > 5000){ // limit to 5000 per single bulk operation
            count = 5000;
            msgs = this.messages.queue.slice(0, count);
        }

        this.elasticClient.bulk(msgs, function(err, res){
            if (err) {
                console.error('ElasticSearch.bulk() failed: ' + err, 'Messages in queue: ', this.messages.queue.length);
            } else {
                this.messages.queue.splice(0, count);
            }
            if(this.messages.queue.length > this.options.queue.overflowLimit){
                console.log('WARNING: Queue overflow! Dropping', (this.messages.queue.length - this.options.queue.overflowLimit), 'messages to the', this.options.queue.overflowLogFile );

                var excessive = this.messages.queue.splice(0, this.messages.queue.length - this.options.queue.overflowLimit);
                var excessiveLog = [];
                excessive.forEach(function(el){
                    excessiveLog.push(JSON.stringify(el.create.data));
                })
                fs.appendFile(this.options.queue.overflowLogFile, excessiveLog.join('\n'), { encoding: 'utf8'});
            }
            this.bulkOperationPending = false;
        }.bind(this));
    } else {
        this.bulkOperationPending = false;
    }
};

SirvlogServer.prototype.getIndexName = function () {
    var d = new Date();
    var m = d.getMonth() + 1;

    //facility = facility.replace(/(\W|\s)/g, '-');

    var newIndexName = this.options.elasticsearch.index.prefix + '-' + d.getFullYear() + '-' + (m < 10 ? ('0' + m) : m);

    if (/(weekly|daily)/.test(this.options.elasticsearch.index.rotate)) {
        if (this.options.elasticsearch.index.rotate == 'weekly') {
            d = new Date(d - ((d.getDay() + 6) % 7) * 24 * 60 * 60 * 1000); // get last Monday date
        }
        var day = d.getDate();
        newIndexName += '-' + (day < 10 ? ('0' + day) : day);
    }

    return newIndexName;//.replace(/-+/g, '-').toLowerCase();
}

SirvlogServer.prototype.rotateIndex = function () {

    var newIndexName = this.getIndexName();

    this.elasticClient.indexExists(newIndexName, function(err, exists){
        if (err) {
            console.error('Failed to verify index "'+ newIndexName +'": ' + err);
            return;
        }

        if(!exists){
            this.elasticClient.createIndex(newIndexName, {
                'settings': this.options.elasticsearch.index.settings,
                'mappings': {
                    message : {
                        date_detection: false,
                        _ttl : {
                            enabled : true
                        },
                        properties:{
                            level: {
                                type: 'byte'
                            }
                        }
                    }
                }
            }, function(err, index, res){
                if (err) {
                    console.error('Failed to create index "'+ newIndexName +'": ' + err);
                } else {
                    console.log('Created new index: ' + newIndexName);
                    this.indexName = newIndexName;
                }
            }.bind(this));
        } else { // index already exists
            this.indexName = newIndexName;
        }
    }.bind(this));

}

exports.createServer = function (argv) {
    return new SirvlogServer(argv);
};

