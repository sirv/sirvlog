
var http = require('http');


var sirvlog = require('../lib/sirvlog_client').createClient({
    facility: 'test',
    server: {
        'address': '127.0.0.1',
        'port': 12514
    },
    backlogLimit: 10000
});


http.createServer(function (req, res) {

    sirvlog.log(req.url);

    res.writeHead(200, {
        'Content-Type': 'text/plain'
    });

    res.end('OK'+'\n');


}).listen(8124, "127.0.0.1");

console.log('Server running at http://127.0.0.1:8124/');

sirvlog.on('error', function(e){
    //console.log('Sirvlog error occured: ', e);
});


