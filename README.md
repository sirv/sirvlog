# sirvlog - centralized log server for applications

sirvlog is Node based centralized log server for applications.

## Features

- JSON-based messages
- server-side filters in Javascript
- uses ElasticSearch
- supports [syslog](#syslog) protocol (tcp only)
- fast

### See also

  * [sirvlog web frontend](https://github.com/sirv/sirvlog-web)
  * [log parser for sirvlog](https://github.com/sirv/sirvlog-parser)
  * [service healh monitors for sirvlog](https://github.com/sirv/sirvlog-monitors)

## Getting started

  * Make sure you have [ElasticSearch](www.elasticsearch.org) installed and running

  * Install sirvlog by either cloning this repo or with npm:

``` sh
$ npm install sirvlog
```

  * Edit config.js to reflect your needs

  * Start server:

``` sh
$ node server.js
```

### Running as [supervisord](http://supervisord.org/) service

[supervisord](http://supervisord.org/) is a great tool to run your Node apps as it allows you to have full control over running services (as well as [monitoring their health status](https://github.com/sirv/sirvlog-monitors) )

So the typical config will be

``` sh
$ cat /etc/supervisor.d/sirvlog.conf

[program:sirvlog]
command=/home/nvm/v0.10.0/bin/node /home/sirvlog/src/server.js --config /home/sirvlog/config.js
process_name=sirvlog
numprocs=1
numprocs_start=0
autostart=true
autorestart=true
startsecs=1
startretries=3
exitcodes=0,2
stopsignal=TERM
stopwaitsecs=10
user=www-data
redirect_stderr=true
stdout_logfile=/home/sirvlog/logs/sirvlog.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=10
stdout_capture_maxbytes=0
stdout_events_enabled=false
stderr_logfile=AUTO
stderr_logfile_maxbytes=50MB
stderr_logfile_backups=10
stderr_capture_maxbytes=0
stderr_events_enabled=false
serverurl=AUTO
```

<a name="syslog" />
### Syslog redirection

``` sh
$ cat /etc/rsyslog.d/99-sirvlog.conf

*.* @@sirvlog.company.com:10514
```

### Node.JS client example:

``` javascript
// connect to sirvlog server
var sirvlog = require('sirvlog').createClient({
    'facility': 'nodejs',
    'server': {
        'address': '127.0.0.1',
        'port': 12514
    }
});

// register 'error' event handler
sirvlog.on('error', function(e){
    console.log('Sirvlog error occured: ', e);
});

// log a message with custom object attached
sirvlog.debug('log message test', {
        custom_field: 1,
        custom_obj: {
            i: 123
        }
});
```

### PHP client example:

``` php
<?php

require_once('./sirvlog/php5/sirvlog_client.php');

// define fallback logger, will be used if connection to sirvlog server is lost or can't be established
function fallback_logger($message){
    file_put_contents('/tmp/sirvlog.log', '['.date(DATE_RFC822).'] '.$message."\n", FILE_APPEND);
}

// create sirvlog client instance
$sirvlog = new SirvlogCLient(array(
    'facility' => 'php',
    'server' => array(
        'address' => '127.0.0.1',
        'port' => 12514
    ),
    'fallback_logger' => 'fallback_logger'
));


// log a message with filename, linenumber and custom object
$sirvlog->log('message', 'backtrace', __FILE__, __LINE__, array(
    'custom_field' => 1,
    'custom_obj' => array(
        'i' => 123
    )
));
```


### Ruby client example:

``` ruby
# encoding: utf-8

require_relative './sirvlog/ruby/lib/sirvlog_client'

sirvlog = SirvlogClient.new({
    "facility" => "ruby",
    'server' => {
        'address' => '127.0.0.1',
        'port' => 12514
    },
})

sirvlog.log("hello", "backtrace", __FILE__, __LINE__, {
    "i" => 1
});
```


### Opscode Chef hanlder:

``` ruby
# sirvlog code is here:
deploy_path = "/home/sirvlog"

chef_handler "SirvLog::SirvLog" do
  source "#{deploy_path}/ruby/chef-handler/sirvlog.rb"
  arguments [{
      "facility" => "chef",
      'server' => {
          'address' => '127.0.0.1',
          'port' => 12514
      }
  }]
  only_if do
    File.exists?("#{deploy_path}/ruby/chef-handler/sirvlog.rb")
  end
  action :nothing
end.run_action(:enable)
```

## Authors

**Oleksiy Krivoshey**

  * [https://github.com/oleksiyk](https://github.com/oleksiyk)

# License (MIT)

Copyright (c) 2013 Sirv.

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
