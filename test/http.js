/*
 * Copyright (c) 2012 Oleksiy Krivoshey
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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


