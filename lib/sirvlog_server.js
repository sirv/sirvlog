// oleksiy krivoshey

var net = require('net');
var sirvlogProtocol = require('./sirvlog_protocol');
var syslogProtocol = require('./syslog_protocol');
//var util = require("util");
var async = require("async");
var _ = require('underscore');

var elastical = require('elastical');

exports.SirvlogServer = SirvlogServer = function (opts) {

    this.options = opts;
    this.servers = {};

    this.messagesCache = {};
    this.bulkOperationPending = {};

    this.elasticClient = new elastical.Client(this.options.elasticsearch.hostname, this.options.elasticsearch.options);

    // send bulk operation once per second
    setInterval(this.saveIndexes.bind(this), 1000);

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

    messageObj.receivedTs = Date.now();

    if(!this.messagesCache[messageObj.facility]){
        this.messagesCache[messageObj.facility] = [];
    }

    this.messagesCache[messageObj.facility].push({
        create: {
            index: this.getIndexName(messageObj.facility),
            type: 'message',
            data: messageObj
        }
    });
};

SirvlogServer.prototype.saveIndexes = function () {
    _.each(_.keys(this.messagesCache), function(facility){
        if(this.messagesCache[facility].length && !this.bulkOperationPending[facility]){
            //console.log('Deferring bulk index operation on ' +  facility);
            _.defer(this.bulkIndex.bind(this), facility);
        }
    }.bind(this))
}

SirvlogServer.prototype.bulkIndex = function (facility) {

    this.rotateIndex(facility, function(err){
        if(err){
            return;
        }

        var count = this.messagesCache[facility].length;

        if(count && !this.bulkOperationPending[facility]){
            this.bulkOperationPending[facility] = true;

            //console.log('Saving ' + count + ' messages for ' + facility);

            this.elasticClient.bulk(this.messagesCache[facility], function(err, res){
                if (err) {
                    console.error('ElasticSearch.bulk() failed for ' + facility + ': ' + err);
                } else {
                    this.messagesCache[facility].splice(0, count);
                }
                this.bulkOperationPending[facility] = false;
            }.bind(this));
        }
    }.bind(this));
};

SirvlogServer.prototype.getIndexName = function (facility) {
    var d = new Date();
    var m = d.getMonth() + 1;

    facility = facility.replace(/(\W|\s)/g, '-');

    var newIndexName = this.options.elasticsearch.index.prefix + '-' + facility + '-' + d.getFullYear() + '-' + (m < 10 ? ('0' + m) : m);

    if (/(weekly|daily)/.test(this.options.elasticsearch.index.rotate)) {
        if (this.options.elasticsearch.index.rotate == 'weekly') {
            d = new Date(d - ((d.getDay() + 6) % 7) * 24 * 60 * 60 * 1000); // get last Monday date
        }
        var day = d.getDate();
        newIndexName += '-' + (day < 10 ? ('0' + day) : day);
    }

    return newIndexName.replace(/-+/g, '-').toLowerCase();
}

SirvlogServer.prototype.rotateIndex = function (facility, cb) {

    var newIndexName = this.getIndexName(facility);

    this.elasticClient.indexExists(newIndexName, function(err, exists){
        if (err) {
            console.error('Failed to verify index "'+ newIndexName +'": ' + err);
            cb.call(null, err);
        } else if(!exists){
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
                    cb.call(null, err);
                } else {
                    console.log('Created new index: ' + newIndexName);
                    cb.call(null, null)
                }
            }.bind(this));
        } else { // index already exists
            cb.call(null, null)
        }
    }.bind(this));

}

exports.createServer = function (argv) {
    return new SirvlogServer(argv);
};

