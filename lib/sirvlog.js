
var module = require('./sirvlog_client');
for (var i in module) {
    exports[i] = module[i];
}

