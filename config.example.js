

module.exports = {

    network: {
        bind: '0.0.0.0',
        port: {
            sirvlog: 12514,
            syslog: 10514
        }
    },

    messageTTL: null, //1000*3600, // in !!milliseconds!!, you can change this._ttl field in filters, set to null for no expire

    useCluster: false,

    elasticsearch: {
        hostname: '127.0.0.1',
        index: {
            prefix: 'sirvlog',
            rotate: 'weekly', // possible values: monthly, weekly, daily
            settings : {
                number_of_shards : 5,
                number_of_replicas : 0,
                mapping: {
                    ignore_malformed: true
                }
            }
        },
        options: {
            port: 9200,
            protocol: 'http',
            timeout: 60000
        }
    },

    /**
     *  each function defined in this array will be called for each log message received.
     *  'this' will be a message object
     *
     *  return null to drop the message
     *
     *  return false to stop further filtering
     *
     *  param: ctx is a filters per connection context (filters can add some info to ctx to share)
     */
    filters: [

        // localhost filter
        function(ctx){
            if(this.hostname == 'localhost'){
                this.hostname = ctx.remoteAddress;
            }
        },

        // basic validation filter
        function(ctx){
            if(typeof this.hostname !== 'string') this.hostname = ctx.remoteAddress;
            if(typeof this.timestamp !== 'number') this.timestamp = Date.now();
            if(typeof this.level !== 'number' || this.level < 0 || this.level > 7) this.level = 6;
            if(typeof this.facility !== 'string') this.facility = 'undefined';
            if(typeof this.message !== 'string') return null; // drop it
            if(this.backtrace !== undefined && typeof this.backtrace !== 'string') this.backtrace = null;
            if(this.file !== undefined && typeof this.file !== 'string') this.file = null;
            if(this.line !== undefined && typeof this.line !== 'number') this.line = null;
        }/*,
        function(ctx){
            if(this.level == 7){ // debug
                this._ttl = 1000*60;
            }
        },*/
    ]
}